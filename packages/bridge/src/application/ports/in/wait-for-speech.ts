import type { SpeechEntry } from '../../../domain/speech-entry.js';
import type { TextMatchOptions } from '../../../domain/text-match.js';

export interface WaitOptions extends TextMatchOptions {
  /** Only entries with `seq > since` count, including ones already in the buffer. */
  since: number;
  timeoutMs: number;
  /** Aborts the wait, for example when the HTTP client disconnects. */
  signal?: AbortSignal | undefined;
}

export interface WaitForSpeech {
  /**
   * Resolves with the first matching speech entry. Rejects with `TIMEOUT` (with
   * `details.entries`: everything seen after `since`) or `SERVICE_UNAVAILABLE` on shutdown.
   */
  wait(options: WaitOptions): Promise<SpeechEntry>;
}
