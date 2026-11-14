import { AppError } from '../../domain/errors.js';
import type { SpeechEntry } from '../../domain/speech-entry.js';
import type { SpeechLog } from '../../domain/speech-log.js';
import { createSpeechMatcher } from '../../domain/text-match.js';
import type { Shutdown } from '../ports/in/lifecycle.js';
import {
  WAIT_SEEN_LIMIT,
  WAIT_TIMEOUT_MS,
  type WaitForSpeech,
  type WaitOptions,
  type WaitResult,
} from '../ports/in/wait-for-speech.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import { followLog, type FollowOptions } from '../shared/follow-log.js';
import { intOption } from '../shared/int-option.js';

export interface WaitForSpeechDeps {
  log: Pick<SpeechLog, 'page' | 'resolveFilter'>;
  events: SpeechEventBus;
  /**
   * A new `pace` for each wait's look through the buffer (see `FollowOptions`), so a long buffer
   * lets speech capture and other requests run in between. Without it, the look is one
   * synchronous block.
   */
  pace?: (() => FollowOptions['pace']) | undefined;
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('The wait was aborted');
}

const unavailable = () => new AppError('SERVICE_UNAVAILABLE', 'The bridge is shutting down');

/** The last {@link WAIT_SEEN_LIMIT} entries pushed, and how many came before them. */
class LastSeen {
  #entries: SpeechEntry[] = [];
  #dropped = 0;

  push(entry: SpeechEntry): void {
    this.#entries.push(entry);
    // Trimmed in batches, so each push stays O(1) on average.
    if (this.#entries.length >= 2 * WAIT_SEEN_LIMIT) this.#trim();
  }

  result(): { seen: SpeechEntry[]; omitted: number } {
    this.#trim();
    return { seen: this.#entries, omitted: this.#dropped };
  }

  #trim(): void {
    const over = this.#entries.length - WAIT_SEEN_LIMIT;
    if (over <= 0) return;
    this.#entries.splice(0, over);
    this.#dropped += over;
  }
}

/**
 * Long-poll for a speech entry (`GET /api/v1/speech/wait`): looks through the buffer after
 * `since`, then follows the new entries, with nothing missed or seen twice in between.
 */
export class WaitForSpeechService implements WaitForSpeech, Shutdown {
  private readonly pending = new Set<(error: Error) => void>();
  private closed = false;

  constructor(private readonly deps: WaitForSpeechDeps) {}

  async wait(options: WaitOptions): Promise<WaitResult> {
    if (this.closed) throw unavailable();
    const { signal } = options;
    const since = intOption('since', options.since, {
      fallback: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    const timeoutMs = intOption('timeoutMs', options.timeoutMs, {
      fallback: WAIT_TIMEOUT_MS.default,
      min: 0,
      max: WAIT_TIMEOUT_MS.max,
    });
    const matches = createSpeechMatcher(options);
    const sessionId = this.deps.log.resolveFilter(options.session);
    if (signal?.aborted) throw abortReason(signal);

    return new Promise<WaitResult>((resolve, reject) => {
      const seen = new LastSeen();
      let done = false;
      let stop: (() => void) | undefined;
      const finish = () => {
        done = true;
        stop?.();
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(fail);
      };
      const fail = (error: Error) => {
        finish();
        reject(error);
      };
      const onAbort = () => fail(abortReason(signal!));
      const timer = setTimeout(() => {
        finish();
        resolve({ status: 'timeout', ...seen.result() });
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.add(fail);

      const failed = (error: unknown) =>
        fail(error instanceof Error ? error : new Error(String(error)));
      try {
        // A match in the buffer can come before `followLog` returns: `done` covers that.
        stop = followLog(
          this.deps,
          { since, sessionId },
          (event) => {
            if (done || event.type !== 'entry') return;
            seen.push(event.entry);
            if (!matches(event.entry)) return;
            finish();
            resolve({ status: 'matched', entry: event.entry });
          },
          { pace: this.deps.pace?.(), onError: failed },
        );
        if (done) stop();
      } catch (error) {
        failed(error);
      }
    });
  }

  /**
   * Rejects all pending waits, and every later one, with `SERVICE_UNAVAILABLE`. The `Shutdown`
   * lifecycle port, not part of `WaitForSpeech`: only the composition root calls it.
   */
  shutdown(): void {
    this.closed = true;
    for (const fail of [...this.pending]) fail(unavailable());
  }
}
