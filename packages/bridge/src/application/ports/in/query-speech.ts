import type { SpeechPage } from '../../../domain/speech-buffer.js';

/** Page size of `list`: the default and the most a caller may ask for. */
export const LIST_LIMIT = { default: 1000, max: 10_000 } as const;

export interface ListOptions {
  /** Only entries with `seq > since`. Default `0`. */
  since?: number | undefined;
  /** At most this many entries. Default and maximum: `LIST_LIMIT`. */
  limit?: number | undefined;
}

export interface QuerySpeech {
  /** Rejects with `INVALID_REQUEST` for a `since` or `limit` out of range. */
  list(options?: ListOptions): SpeechPage;
}
