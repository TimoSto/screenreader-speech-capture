import { checkApiVersion } from '../../domain/api-version.js';
import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeRestartedError,
  BridgeUnreachableError,
  SpeechTimeoutError,
} from '../../domain/errors.js';
import type { BridgeStatus } from '../../domain/bridge-status.js';
import type { Session, SessionList, SessionRef } from '../../domain/session.js';
import { isSpeech, type SpeechEntry } from '../../domain/speech-entry.js';
import { advanceSequence, toMatcher, type SpeechMatch } from '../../domain/text-match.js';
import type {
  GetSpeechOptions,
  GetTextOptions,
  OnSpeechOptions,
  ReadyOptions,
  Recording,
  SilenceOptions,
  SpeechCapture,
  StartSessionOptions,
  WaitOptions,
} from '../ports/in/speech-capture.js';
import type { BridgeApi } from '../ports/out/bridge-api.js';
import type { Clock } from '../ports/out/clock.js';
import { startLiveFeed } from './live-feed.js';

export interface SpeechCaptureServiceDeps {
  api: BridgeApi;
  clock: Clock;
  /** The HTTP API version this client was built for (`API_VERSION` from the shared contract). */
  apiVersion: string;
  /** How often waits ask the bridge for new entries. Default 50 ms. */
  pollMs?: number;
}

/** Largest `limit` the bridge accepts for `GET /api/v1/speech`. */
const MAX_PAGE = 10_000;

const DEFAULTS = { timeout: 5000, quietFor: 500, silenceTimeout: 10_000, readyTimeout: 120_000 };

export class SpeechCaptureService implements SpeechCapture {
  #cursor = 0;
  /**
   * The bridge run (`instanceId`) the cursor's `seq` belongs to. `undefined`: not known yet, the
   * next speech read adopts the run that answers.
   */
  #cursorInstance: string | undefined;
  #compatible: Promise<void> | undefined;

  constructor(private readonly deps: SpeechCaptureServiceDeps) {}

  cursor(): number {
    return this.#cursor;
  }

  setCursor(seq: number): void {
    if (!Number.isSafeInteger(seq) || seq < 0) {
      throw new RangeError(`The cursor must be a seq (an integer >= 0), got ${seq}`);
    }
    this.#cursor = seq;
  }

  async getSpeech(options: GetSpeechOptions = {}): Promise<SpeechEntry[]> {
    await this.compatible();
    const entries = await this.fetchSince(options.since ?? this.#cursor, options.session);
    const wanted = options.includeMarkers ? entries : entries.filter(isSpeech);
    return options.limit === undefined ? wanted : wanted.slice(0, options.limit);
  }

  async getText(options: GetTextOptions = {}): Promise<string> {
    const entries = await this.getSpeech({ since: options.since, session: options.session });
    return entries.map((e) => e.text).join(options.separator ?? '\n');
  }

  async clear(): Promise<void> {
    await this.compatible();
    await this.deps.api.clear();
    // seq survives a clear, so everything in the buffer from now on is newer than the clear.
    this.#cursor = 0;
    this.#cursorInstance = undefined;
  }

  async startSession(name: string, options: StartSessionOptions = {}): Promise<Session> {
    await this.compatible();
    const before = await this.endSeq();
    const session = await this.deps.api.startSession({ name, run: options.run });
    // Speech may arrive between the two requests: the cursor goes to the last entry before the
    // session's first one, so nothing of the session is skipped and nothing older is read.
    let start = before.seq;
    for (const entry of await this.fetchSince(before.seq, undefined, before.instanceId)) {
      if (entry.sessionId === session.id) break;
      start = entry.seq;
    }
    // A new session starts a new cursor, also on a bridge that restarted since the last read.
    this.#cursor = start;
    this.#cursorInstance = before.instanceId;
    return session;
  }

  async endSession(): Promise<void> {
    await this.compatible();
    await this.deps.api.endSession();
  }

  async sessions(): Promise<SessionList> {
    await this.compatible();
    return this.deps.api.listSessions();
  }

  async mark(label: string): Promise<SpeechEntry> {
    await this.compatible();
    return this.deps.api.mark(label);
  }

  async status(): Promise<BridgeStatus> {
    const status = await this.deps.api.status();
    checkApiVersion(status.bridge.apiVersion, this.deps.apiVersion);
    this.#compatible = Promise.resolve();
    return status;
  }

  async waitForReady(options: ReadyOptions = {}): Promise<BridgeStatus> {
    const { clock } = this.deps;
    const timeout = options.timeout ?? DEFAULTS.readyTimeout;
    const deadline = clock.now() + timeout;
    let last: string;
    for (;;) {
      try {
        const status = await this.status();
        if (status.bridge.state === 'ready') return status;
        last = `state is ${status.bridge.state}`;
      } catch (error) {
        const starting = error instanceof BridgeHttpError && error.status === 503;
        if (!(error instanceof BridgeUnreachableError) && !starting) throw error;
        last = error.message;
      }
      const left = deadline - clock.now();
      if (left <= 0) {
        throw new BridgeNotReadyError(`The bridge was not ready within ${timeout} ms: ${last}`);
      }
      await clock.sleep(Math.min(this.pollMs * 10, left));
    }
  }

  async waitForOutput(match: SpeechMatch, options: WaitOptions = {}): Promise<SpeechEntry> {
    const test = toMatcher(match, options);
    await this.compatible();
    const entry = await this.search(
      options,
      (entries) => entries.find(test),
      `No speech matched ${describe(match)}`,
    );
    this.#cursor = entry.seq;
    return entry;
  }

  async waitForSequence(
    matches: readonly SpeechMatch[],
    options: WaitOptions = {},
  ): Promise<SpeechEntry[]> {
    if (matches.length === 0) throw new TypeError('waitForSequence needs at least one match');
    const matchers = matches.map((m) => toMatcher(m, options));
    await this.compatible();
    let found: SpeechEntry[] = [];
    const result = await this.search(
      options,
      (entries) => {
        found = advanceSequence(matchers, found, entries);
        return found.length === matchers.length ? found : undefined;
      },
      () =>
        `Only ${found.length} of ${matches.length} matches occurred in order ` +
        `(next: ${describe(matches[found.length]!)})`,
    );
    this.#cursor = result.at(-1)!.seq;
    return result;
  }

  async waitForSilence(options: SilenceOptions = {}): Promise<void> {
    const { clock } = this.deps;
    const quietFor = options.quietFor ?? DEFAULTS.quietFor;
    const timeout = options.timeout ?? DEFAULTS.silenceTimeout;
    await this.compatible();
    const start = clock.now();
    const end = await this.endSeq();
    let from = end.seq;
    // Speech may have arrived just before the call, so silence is counted from the call.
    let lastSpeech = start;
    const seen: SpeechEntry[] = [];
    for (;;) {
      const entries = await this.fetchSince(from, undefined, end.instanceId);
      if (entries.length > 0) from = entries.at(-1)!.seq;
      const speech = entries.filter(isSpeech);
      const now = clock.now();
      if (speech.length > 0) {
        seen.push(...speech);
        lastSpeech = now;
      }
      const quiet = now - lastSpeech;
      if (quiet >= quietFor) return;
      if (now - start >= timeout) {
        throw new SpeechTimeoutError(
          `Speech did not pause for ${quietFor} ms within ${timeout} ms`,
          seen,
        );
      }
      await clock.sleep(Math.min(this.pollMs, quietFor - quiet, start + timeout - now));
    }
  }

  async record<T>(fn: () => T | Promise<T>, options: SilenceOptions = {}): Promise<Recording<T>> {
    await this.compatible();
    const start = await this.endSeq();
    const result = await fn();
    await this.waitForSilence(options);
    const entries = await this.fetchSince(start.seq, undefined, start.instanceId);
    const last = entries.at(-1)?.seq;
    if (last !== undefined) this.#cursor = last;
    // A cursor of an earlier bridge run means nothing on this one: start from `fn`'s start.
    else if (this.#cursorInstance !== start.instanceId) this.#cursor = start.seq;
    this.#cursorInstance = start.instanceId;
    return { result, entries: entries.filter(isSpeech) };
  }

  onSpeech(listener: (entry: SpeechEntry) => void, options: OnSpeechOptions = {}): () => void {
    const { api, clock } = this.deps;
    return startLiveFeed(
      { api, clock, ensureCompatible: () => this.compatible() },
      listener,
      options,
    );
  }

  private get pollMs(): number {
    return this.deps.pollMs ?? 50;
  }

  /** Checks the API version once. A failed check is repeated on the next call. */
  private compatible(): Promise<void> {
    this.#compatible ??= this.status().then(
      () => undefined,
      (error: unknown) => {
        this.#compatible = undefined;
        throw error;
      },
    );
    return this.#compatible;
  }

  /** The `seq` of the newest entry in the buffer (0 if it is empty), and its bridge run. */
  private async endSeq(): Promise<{ seq: number; instanceId: string }> {
    const { buffer, bridge } = await this.deps.api.status();
    return { seq: buffer.lastSeq ?? 0, instanceId: bridge.instanceId };
  }

  /**
   * Checks that a page came from the bridge run `since` belongs to: `expected`, or else the
   * cursor's run (adopted if not known yet). After a restart, moves the cursor to the new run's
   * start, so the next call works, and throws {@link BridgeRestartedError}.
   */
  private checkInstance(instanceId: string, expected: string | undefined): void {
    const known = expected ?? (this.#cursorInstance ??= instanceId);
    if (instanceId === known) return;
    this.#cursor = 0;
    this.#cursorInstance = instanceId;
    // The new bridge may speak another API version.
    this.#compatible = undefined;
    throw new BridgeRestartedError(known, instanceId);
  }

  /**
   * Every entry with `seq > since` (of `session`, if given), across pages. `expected` is the
   * bridge run `since` came from (default: the cursor's).
   */
  private async fetchSince(
    since: number,
    session?: SessionRef,
    expected?: string,
  ): Promise<SpeechEntry[]> {
    const all: SpeechEntry[] = [];
    let from = since;
    for (;;) {
      const page = await this.deps.api.listSpeech({
        since: from,
        limit: MAX_PAGE,
        ...(session === undefined ? {} : { session }),
      });
      this.checkInstance(page.instanceId, expected);
      all.push(...page.entries);
      const last = page.entries.at(-1);
      if (!page.hasMore || last === undefined) return all;
      from = last.seq;
    }
  }

  /**
   * Polls for entries after the cursor (or `options.since`) until `step` returns a result.
   * Rejects with {@link SpeechTimeoutError} (and the speech seen) after `options.timeout`.
   */
  private async search<T>(
    options: WaitOptions,
    step: (entries: SpeechEntry[]) => T | undefined,
    failure: string | (() => string),
  ): Promise<T> {
    const { clock } = this.deps;
    const timeout = options.timeout ?? DEFAULTS.timeout;
    const deadline = clock.now() + timeout;
    const seen: SpeechEntry[] = [];
    let from = options.since ?? this.#cursor;
    for (;;) {
      const entries = await this.fetchSince(from, options.session);
      if (entries.length > 0) from = entries.at(-1)!.seq;
      seen.push(...entries.filter(isSpeech));
      const result = step(entries);
      if (result !== undefined) return result;
      const left = deadline - clock.now();
      if (left <= 0) {
        const message = typeof failure === 'string' ? failure : failure();
        throw new SpeechTimeoutError(`${message} within ${timeout} ms`, seen);
      }
      await clock.sleep(Math.min(this.pollMs, left));
    }
  }
}

function describe(match: SpeechMatch): string {
  if (typeof match === 'string') return JSON.stringify(match);
  if (match instanceof RegExp) return String(match);
  return 'the predicate';
}
