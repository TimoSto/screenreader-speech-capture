import { AppError } from '../../domain/errors.js';
import type { SpeechEntry } from '../../domain/speech-entry.js';
import { createSpeechMatcher, type TextMatchOptions } from '../../domain/text-match.js';
import type { WaitForSpeech, WaitOptions } from '../ports/in/wait-for-speech.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

export interface WaitForSpeechDeps {
  repository: SpeechRepository;
  events: SpeechEventBus;
}

function describe({ contains, regex }: TextMatchOptions): string {
  return regex !== undefined ? `/${regex}/` : `"${contains}"`;
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
  async wait(options: WaitOptions): Promise<SpeechEntry> {
    if (this.closed) throw unavailable();
    const { since, timeoutMs, signal } = options;
    const matches = createSpeechMatcher(options);
    if (signal?.aborted) throw abortReason(signal);

    const seen = [...this.deps.repository.list(since, Number.MAX_SAFE_INTEGER).entries];
    const found = seen.find(matches);
    if (found) return found;

    return new Promise<SpeechEntry>((resolve, reject) => {
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
        resolve(event.entry);
      });
      const timer = setTimeout(() => {
        const message = `No speech matched ${describe(options)} within ${timeoutMs} ms`;
        fail(new AppError('TIMEOUT', message, { entries: seen }));
      }, timeoutMs);
      signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.add(fail);
    });
  }

  shutdown(): void {
    this.closed = true;
    for (const fail of [...this.pending]) fail(unavailable());
  }
}
