import { AppError } from '../../domain/errors.js';
import { createSpeechMatcher } from '../../domain/text-match.js';
import {
  WAIT_TIMEOUT_MS,
  type WaitForSpeech,
  type WaitOptions,
  type WaitResult,
} from '../ports/in/wait-for-speech.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';
import { intOption } from './int-option.js';

export interface WaitForSpeechDeps {
  repository: SpeechRepository;
  events: SpeechEventBus;
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('The wait was aborted');
}

const unavailable = () => new AppError('SERVICE_UNAVAILABLE', 'The bridge is shutting down');

/**
 * Long-poll for a speech entry (`GET /api/v1/speech/wait`): looks in the buffer first, then
 * waits for new entries on the event bus.
 */
export class WaitForSpeechService implements WaitForSpeech {
  private readonly pending = new Set<(error: Error) => void>();
  private closed = false;

  constructor(private readonly deps: WaitForSpeechDeps) {}

  // No `await` before the subscription: the buffer check and the subscription run in one
  // synchronous block, so no entry slips through in between.
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
    if (signal?.aborted) throw abortReason(signal);

    const seen = [...this.deps.repository.list(since).entries];
    const found = seen.find(matches);
    if (found) return { status: 'matched', entry: found };

    return new Promise<WaitResult>((resolve, reject) => {
      const finish = () => {
        unsubscribe();
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.pending.delete(fail);
      };
      const fail = (error: Error) => {
        finish();
        reject(error);
      };
      const onAbort = () => fail(abortReason(signal!));

      const unsubscribe = this.deps.events.subscribe((event) => {
        if (event.type !== 'entry' || event.entry.seq <= since) return;
        seen.push(event.entry);
        if (!matches(event.entry)) return;
        finish();
        resolve({ status: 'matched', entry: event.entry });
      });
      const timer = setTimeout(() => {
        finish();
        resolve({ status: 'timeout', seen });
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.add(fail);
    });
  }

  /**
   * Rejects all pending waits, and every later one, with `SERVICE_UNAVAILABLE`. Lifecycle, so
   * not part of the `WaitForSpeech` port: only the composition root calls it.
   */
  shutdown(): void {
    this.closed = true;
    for (const fail of [...this.pending]) fail(unavailable());
  }
}
