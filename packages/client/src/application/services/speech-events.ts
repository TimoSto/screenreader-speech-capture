import {
  BridgeHttpError,
  ClientConfigError,
  IncompatibleBridgeError,
  INVALID_RESPONSE,
} from '../../domain/errors.js';
import type { SpeechFeedEvent } from '../../domain/feed-event.js';
import type { BridgeApi } from '../ports/out/bridge-api.js';
import type { Clock } from '../ports/out/clock.js';

export interface SpeechEventsDeps {
  api: BridgeApi;
  clock: Clock;
  /** Resolves once the bridge speaks a compatible API version; runs before every connect. */
  ensureCompatible: () => Promise<void>;
}

export interface SpeechEventsOptions {
  /** Replay the buffered entries with `seq > since` first. `null`: only new entries. */
  since: number | null;
  /** Only this session's entries (an `id`: `'current'` is resolved by the caller). */
  session?: number | undefined;
  /** Ends the events. */
  signal: AbortSignal;
  /** A connection was lost or ended; the events go on after a reconnect. */
  onRetry?: ((error: Error) => void) | undefined;
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

/**
 * The live feed (`GET /api/v1/speech/stream`) as one sequence of events across connections: the
 * code path behind both `onSpeech` and the waits. Reconnects with `Last-Event-ID` and backoff, so
 * no entry is lost or repeated, also across a bridge restart (`seq` keeps rising). Ends when
 * `signal` aborts; throws errors a reconnect can't fix (an incompatible bridge, an HTTP `4xx`, an
 * invalid bridge URL).
 */
export async function* speechEvents(
  deps: SpeechEventsDeps,
  options: SpeechEventsOptions,
): AsyncGenerator<SpeechFeedEvent> {
  const { api, clock, ensureCompatible } = deps;
  const { session, signal } = options;
  const backoff = new Backoff();
  /** The `seq` of the last entry seen: a reconnect asks the bridge for what came after it. */
  let lastEventId = options.since;

  while (!signal.aborted) {
    const connectedAt = clock.now();
    let lost: Error;
    try {
      // Checked on reconnects too: a restarted bridge may be another version.
      await ensureCompatible();
      const events = api.streamSpeech({
        lastEventId,
        signal,
        ...(session === undefined ? {} : { session }),
      });
      for await (const event of events) {
        if (signal.aborted) return;
        backoff.reset();
        if (event.type === 'entry') lastEventId = event.entry.seq;
        yield event;
      }
      if (signal.aborted) return;
      lost = new Error('The bridge closed the live feed');
    } catch (error) {
      if (signal.aborted) return;
      if (isFatal(error)) throw error;
      lost = error instanceof Error ? error : new Error(String(error));
    }
    options.onRetry?.(lost);
    // A connection that lasted a while was healthy: start over with the shortest delay.
    if (clock.now() - connectedAt >= Backoff.MAX) backoff.reset();
    try {
      await clock.sleep(backoff.next(), signal);
    } catch {
      return; // aborted
    }
  }
}

/** Errors a reconnect can't fix. */
function isFatal(error: unknown): boolean {
  return (
    error instanceof IncompatibleBridgeError ||
    error instanceof ClientConfigError ||
    (error instanceof BridgeHttpError &&
      ((error.status >= 400 && error.status < 500) || error.code === INVALID_RESPONSE))
  );
}
