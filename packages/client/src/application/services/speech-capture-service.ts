import { checkApiVersion } from '../../domain/api-version.js';
import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  SpeechTimeoutError,
} from '../../domain/errors.js';
import type { BridgeStatus } from '../../domain/bridge-status.js';
import type { SessionList, SessionRef, StartedSession } from '../../domain/session.js';
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
import { speechEvents } from './speech-events.js';

export interface SpeechCaptureServiceDeps {
  api: BridgeApi;
  clock: Clock;
  /** The HTTP API version this client was built for (`API_VERSION` from the shared contract). */
  apiVersion: string;
}

/** Largest `limit` the bridge accepts for `GET /api/v1/speech`. */
const MAX_PAGE = 10_000;

const DEFAULTS = { timeout: 5000, quietFor: 500, silenceTimeout: 10_000, readyTimeout: 120_000 };

/** How often `waitForReady` asks for the status. */
const READY_POLL_MS = 500;

export class SpeechCaptureService implements SpeechCapture {
  /**
   * `seq` keeps rising across bridge restarts (it starts at the bridge's start time), so a cursor
   * from before a restart reads the new run from its start.
   */
  #cursor = 0;
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
  }

  async startSession(name: string, options: StartSessionOptions = {}): Promise<StartedSession> {
    await this.compatible();
    const session = await this.deps.api.startSession({ name, run: options.run });
    // Everything after `startSeq` belongs to the session (or a later one).
    this.#cursor = session.startSeq;
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
      await clock.sleep(Math.min(READY_POLL_MS, left));
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
    // Speech may have arrived just before the call, so silence is counted from the call.
    let lastSpeech = start;
    const seen: SpeechEntry[] = [];
    const left = () => Math.min(lastSpeech + quietFor, start + timeout) - clock.now();
    await this.follow({ since: end }, left(), (entry, timer) => {
      if (!isSpeech(entry)) return undefined;
      seen.push(entry);
      lastSpeech = clock.now();
      timer.set(left());
      return undefined;
    });
    // The timer ran out at the earlier of the two; timers may fire a little early, so don't
    // compare with `now()`.
    if (lastSpeech + quietFor <= start + timeout) return;
    throw new SpeechTimeoutError(
      `Speech did not pause for ${quietFor} ms within ${timeout} ms`,
      seen,
    );
  }

  async record<T>(fn: () => T | Promise<T>, options: SilenceOptions = {}): Promise<Recording<T>> {
    await this.compatible();
    const start = await this.endSeq();
    const result = await fn();
    await this.waitForSilence(options);
    const entries = await this.fetchSince(start);
    const last = entries.at(-1)?.seq;
    if (last !== undefined) this.#cursor = last;
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

  /** The `seq` of the newest entry in the buffer, 0 if it is empty. */
  private async endSeq(): Promise<number> {
    return (await this.deps.api.status()).buffer.lastSeq ?? 0;
  }

  /** Every entry with `seq > since` (of `session`, if given), across pages. */
  private async fetchSince(since: number, session?: SessionRef): Promise<SpeechEntry[]> {
    const all: SpeechEntry[] = [];
    let from = since;
    for (;;) {
      const page = await this.deps.api.listSpeech({
        since: from,
        limit: MAX_PAGE,
        ...(session === undefined ? {} : { session }),
      });
      all.push(...page.entries);
      const last = page.entries.at(-1);
      if (!page.hasMore || last === undefined) return all;
      from = last.seq;
    }
  }

  /**
   * The session id a wait is limited to: `'current'` becomes the session current now, and stays
   * that one for the whole wait, even if another session starts meanwhile.
   */
  private async resolveSession(ref: SessionRef | undefined): Promise<number | undefined> {
    if (ref !== 'current') return ref;
    const { current } = (await this.deps.api.status()).session;
    // The answer the bridge gives a read with `session=current`.
    if (!current) throw new BridgeHttpError(404, 'NOT_FOUND', 'No session is current');
    return current.id;
  }

  /**
   * Searches the entries after the cursor (or `options.since`) until `step` returns a result:
   * first the buffer, then the live feed. Rejects with {@link SpeechTimeoutError} (and the speech
   * seen) after `options.timeout`.
   */
  private async search<T>(
    options: WaitOptions,
    step: (entries: SpeechEntry[]) => T | undefined,
    failure: string | (() => string),
  ): Promise<T> {
    const { clock } = this.deps;
    const timeout = options.timeout ?? DEFAULTS.timeout;
    const deadline = clock.now() + timeout;
    const since = options.since ?? this.#cursor;
    const session = await this.resolveSession(options.session);
    const seen: SpeechEntry[] = [];
    const consume = (entries: SpeechEntry[]) => {
      seen.push(...entries.filter(isSpeech));
      return step(entries);
    };
    // Speech that is already there is found without opening the live feed.
    const buffered = await this.fetchSince(since, session);
    let result = consume(buffered);
    const left = deadline - clock.now();
    if (result === undefined && left > 0) {
      const from = buffered.at(-1)?.seq ?? since;
      result = await this.follow({ since: from, session }, left, (entry) => consume([entry]));
    }
    if (result !== undefined) return result;
    const message = typeof failure === 'string' ? failure : failure();
    throw new SpeechTimeoutError(`${message} within ${timeout} ms`, seen);
  }

  /**
   * Reads the live feed from `since` and hands each entry to `onEntry` until it returns a result,
   * or the timer (first set to `ms`, `onEntry` may set it again) runs out: then `undefined`.
   */
  private async follow<T>(
    from: { since: number; session?: number | undefined },
    ms: number,
    onEntry: (entry: SpeechEntry, timer: Timer) => T | undefined,
  ): Promise<T | undefined> {
    const { api, clock } = this.deps;
    const feed = new AbortController();
    const timer = new Timer(clock, () => feed.abort());
    timer.set(ms);
    try {
      const events = speechEvents(
        { api, clock, ensureCompatible: () => this.compatible() },
        { since: from.since, session: from.session, signal: feed.signal },
      );
      for await (const event of events) {
        if (event.type === 'entry') {
          const result = onEntry(event.entry, timer);
          if (result !== undefined) return result;
        }
      }
      return undefined; // the timer ran out
    } finally {
      timer.stop();
      feed.abort();
    }
  }
}

/** A timeout that can be set again: the last {@link set} wins. */
class Timer {
  #controller: AbortController | undefined;

  constructor(
    private readonly clock: Clock,
    private readonly onTimeout: () => void,
  ) {}

  /** Calls `onTimeout` in `ms` (now if `ms <= 0`), unless set again or stopped before. */
  set(ms: number): void {
    this.stop();
    const controller = new AbortController();
    this.#controller = controller;
    this.clock.sleep(Math.max(0, ms), controller.signal).then(this.onTimeout, () => {
      // stopped or set again
    });
  }

  stop(): void {
    this.#controller?.abort();
  }
}

function describe(match: SpeechMatch): string {
  if (typeof match === 'string') return JSON.stringify(match);
  if (match instanceof RegExp) return String(match);
  return 'the predicate';
}
