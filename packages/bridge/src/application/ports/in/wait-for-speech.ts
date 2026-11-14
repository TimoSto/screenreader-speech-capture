import type { SessionFilter } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import type { TextMatchOptions } from '../../../domain/text-match.js';

/** How long `wait` waits: the default and the most a caller may ask for. */
export const WAIT_TIMEOUT_MS = { default: 5000, max: 300_000 } as const;

/** How many of the entries a wait saw its timeout answer holds at most: the last ones. */
export const WAIT_SEEN_LIMIT = 1000;

export interface WaitOptions extends TextMatchOptions {
  /** Only entries with `seq > since` count, including ones already in the buffer. Default `0`. */
  since?: number | undefined;
  /** Default and maximum: `WAIT_TIMEOUT_MS`. */
  timeoutMs?: number | undefined;
  /**
   * Only this session's entries match (`none`: only those outside sessions). `current` is resolved when the wait starts, so speech of
   * a session started later never matches.
   */
  session?: SessionFilter | undefined;
  /** Aborts the wait, for example when the HTTP client disconnects. */
  signal?: AbortSignal | undefined;
}

/**
 * The outcome of a wait. A timeout is an expected result, not a failure, so it carries its
 * data in a typed shape instead of an error's `details`.
 */
export type WaitResult =
  | { status: 'matched'; entry: SpeechEntry }
  | {
      status: 'timeout';
      /**
       * The last {@link WAIT_SEEN_LIMIT} entries seen after `since`, oldest first. A clear during
       * the wait doesn't remove entries from it: they show what the screen reader said while the
       * wait was open.
       */
      seen: SpeechEntry[];
      /** How many entries seen before those were left out. */
      omitted: number;
    };

export interface WaitForSpeech {
  /**
   * Resolves with the first matching speech entry, or with `timeout` when none arrived in
   * time. Rejects with `INVALID_REQUEST` for bad match or range options, `NOT_FOUND` for an
   * unknown session, `SERVICE_UNAVAILABLE` on shutdown, or the signal's reason when aborted.
   */
  wait(options: WaitOptions): Promise<WaitResult>;
}
