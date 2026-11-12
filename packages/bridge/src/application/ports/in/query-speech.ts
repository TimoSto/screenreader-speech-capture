import type { SessionFilter } from '../../../domain/session.js';
import type { SpeechPage } from '../../../domain/speech-buffer.js';

/** Page size of `list`: the default and the most a caller may ask for. */
export const LIST_LIMIT = { default: 1000, max: 10_000 } as const;

export interface ListOptions {
  /** Only entries with `seq > since`. Default `0`. */
  since?: number | undefined;
  /** At most this many entries. Default and maximum: `LIST_LIMIT`. */
  limit?: number | undefined;
  /** Only this session's entries. `current` is resolved when the call is made. */
  session?: SessionFilter | undefined;
}

export interface QuerySpeech {
  /**
   * Rejects with `INVALID_REQUEST` for a `since` or `limit` out of range, and with `NOT_FOUND`
   * for a session that never existed or `current` when none is current.
   */
  list(options?: ListOptions): SpeechPage;
}
