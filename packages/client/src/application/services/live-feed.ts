import { ClientConfigError } from '../../domain/bridge-url.js';
import { BridgeHttpError, IncompatibleBridgeError } from '../../domain/errors.js';
import type { SpeechFeedEvent } from '../../domain/feed-event.js';
import { isSpeech, type SpeechEntry } from '../../domain/speech-entry.js';
import type { OnSpeechOptions } from '../ports/in/speech-capture.js';
import type { BridgeApi } from '../ports/out/bridge-api.js';
import type { Clock } from '../ports/out/clock.js';

export interface LiveFeedDeps {
  api: BridgeApi;
  clock: Clock;
  /** Resolves once the bridge speaks a compatible API version; runs before every connect. */
  ensureCompatible: () => Promise<void>;
}

type Listener = (entry: SpeechEntry) => void;

/**
 * Starts the live feed (`onSpeech`): it delivers the bridge's SSE events to `listener` and the
 * `options` callbacks, and reconnects with backoff until unsubscribed or a fatal error.
 * Returns the unsubscribe function.
 */
export function startLiveFeed(
  deps: LiveFeedDeps,
  listener: Listener,
  options: OnSpeechOptions = {},
): () => void {
  const controller = new AbortController();
  void new LiveFeed(deps, listener, options, controller.signal).run();
  return () => controller.abort();
}

/** Reconnect delays: doubling from `MIN` up to `MAX`. */
class Backoff {
  static readonly MIN = 250;
  static readonly MAX = 5000;
  #delay = Backoff.MIN;

  reset(): void {
    this.#delay = Backoff.MIN;
  }

  /** The delay to wait now; the next one is twice as long. */
  next(): number {
    const delay = this.#delay;
    this.#delay = Math.min(delay * 2, Backoff.MAX);
    return delay;
  }
}

/** One subscription: the connect / reconnect loop and the dispatch of its events. */
class LiveFeed {
  /** The `seq` of the last entry seen: a reconnect asks the bridge for what came after it. */
  #lastEventId: number | null;
  readonly #backoff = new Backoff();

  constructor(
    private readonly deps: LiveFeedDeps,
    private readonly listener: Listener,
    private readonly options: OnSpeechOptions,
    private readonly signal: AbortSignal,
  ) {
    this.#lastEventId = options.since ?? null;
  }

  /** Runs until `signal` aborts or a fatal error. Never rejects. */
  async run(): Promise<void> {
    for (let reconnect = false; !this.signal.aborted; reconnect = true) {
      const connectedAt = this.deps.clock.now();
      try {
        await this.#stream(reconnect);
        if (this.signal.aborted) return;
        this.#report(new Error('The bridge closed the live feed'), true);
      } catch (error) {
        if (this.signal.aborted) return;
        const fatal = isFatal(error);
        this.#report(error, !fatal);
        if (fatal) return;
      }
      if (!(await this.#waitBeforeReconnect(connectedAt))) return;
    }
  }

  /** One connection: dispatches its events until it ends, throws, or `signal` aborts. */
  async #stream(reconnect: boolean): Promise<void> {
    await this.deps.ensureCompatible();
    if (reconnect && (await this.#bridgeRestarted())) {
      // A new bridge counts `seq` from 1 again: asking for `seq > lastEventId` would skip its
      // entries.
      this.#lastEventId = 0;
    }
    const events = this.deps.api.streamSpeech({
      lastEventId: this.#lastEventId,
      signal: this.signal,
    });
    for await (const event of events) {
      if (this.signal.aborted) return;
      this.#backoff.reset();
      this.#dispatch(event);
    }
  }

  #dispatch(event: SpeechFeedEvent): void {
    const { options } = this;
    switch (event.type) {
      case 'entry': {
        const { entry } = event;
        this.#lastEventId = entry.seq;
        if (options.includeMarkers || isSpeech(entry)) this.#notify(() => this.listener(entry));
        break;
      }
      case 'session': {
        const { session } = event;
        this.#notify(() => options.onSession?.(session));
        break;
      }
      case 'clear':
        this.#notify(() => options.onClear?.());
        break;
      case 'truncated':
        this.#notify(() => options.onTruncated?.());
        break;
    }
  }

  /** Whether the bridge has restarted since it sent the entry `#lastEventId`. */
  async #bridgeRestarted(): Promise<boolean> {
    if (this.#lastEventId === null) return false;
    // seq survives a clear, so on the same bridge the newest entry is never older than one
    // already seen, unless the buffer is empty: then a replay from 0 is empty too.
    return ((await this.deps.api.status()).buffer.lastSeq ?? 0) < this.#lastEventId;
  }

  /** Sleeps the backoff delay. Returns false if unsubscribed meanwhile. */
  async #waitBeforeReconnect(connectedAt: number): Promise<boolean> {
    const { clock } = this.deps;
    // A connection that lasted a while was healthy: start over with the shortest delay.
    if (clock.now() - connectedAt >= Backoff.MAX) this.#backoff.reset();
    try {
      await clock.sleep(this.#backoff.next(), this.signal);
      return true;
    } catch {
      return false; // unsubscribed
    }
  }

  /** Runs a user callback; a throw is reported and the feed goes on. */
  #notify(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.#report(error, true);
    }
  }

  #report(error: unknown, retrying: boolean): void {
    if (this.signal.aborted) return;
    try {
      this.options.onError?.(toError(error), { retrying });
    } catch {
      // An onError that throws has nowhere left to report to.
    }
  }
}

/** Errors a reconnect can't fix. */
function isFatal(error: unknown): boolean {
  return (
    error instanceof IncompatibleBridgeError ||
    error instanceof ClientConfigError ||
    (error instanceof BridgeHttpError && error.status >= 400 && error.status < 500)
  );
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
