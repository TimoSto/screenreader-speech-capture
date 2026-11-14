import type { SessionFilter } from '../../../domain/session.js';
import type { SpeechPage } from '../../../domain/speech-buffer.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import type { SpeechEvent } from '../../../domain/speech-event.js';

/** Page size of `list`: the default and the most a caller may ask for. */
export const LIST_LIMIT = { default: 1000, max: 10_000 } as const;

export interface ListOptions {
  /** Only entries with `seq > since`. Default `0`. */
  since?: number | undefined;
  /** At most this many entries. Default and maximum: `LIST_LIMIT`. */
  limit?: number | undefined;
  /**
   * Only this session's entries, `none`: only those outside sessions. `current` is resolved when
   * the call is made.
   */
  session?: SessionFilter | undefined;
}

/**
 * What a watcher gets: the speech events, plus `truncated` before a replay when entries after
 * `since` were already dropped because the buffer was full.
 */
export type WatchEvent = SpeechEvent | { type: 'truncated' };

export type WatchListener = (event: WatchEvent) => void;

export interface WatchOptions {
  /**
   * Only this session's `entry` events (`none`: only those outside sessions; `clear` and
   * `session` events always come). `current` is resolved when the watch starts.
   */
  session?: SessionFilter | undefined;
  /**
   * Called after each replayed entry. A promise pauses the replay until it resolves, so a long
   * replay can follow the reader's speed and let other work run (the SSE stream). Without it, the
   * replay runs in one synchronous block.
   */
  pace?: (() => Promise<void> | undefined) | undefined;
  /** A listener that throws after the replay paused ends the watch, and the error lands here. */
  onError?: ((error: unknown) => void) | undefined;
}

/** The speech buffer's use cases as the HTTP API uses them: read, watch, clear and mark. */
export interface SpeechUseCases {
  /**
   * Rejects with `INVALID_REQUEST` for a `since` or `limit` out of range, and with `NOT_FOUND`
   * for a session that never existed or `current` when none is current.
   */
  list(options?: ListOptions): SpeechPage;
  /**
   * Calls `listener` with every new entry and clear, until the returned function is called.
   * With `since`, it first gets the buffered entries with `seq > since` (an SSE reconnect with
   * `Last-Event-ID`), with nothing missed or repeated in between. If some of them were already
   * dropped, a `truncated` event comes first. Throws `NOT_FOUND` for an unknown session, before
   * calling `listener`.
   *
   * With `pace`, the replay may go on after `watch` returns. It reads the buffer until it has
   * caught up, then follows the new events, still with nothing missed or repeated. `clear` and
   * `session` events that happen meanwhile come between the replayed entries, and a `truncated`
   * event comes again if entries were dropped while the replay was paused.
   */
  watch(since: number | null, listener: WatchListener, options?: WatchOptions): () => void;
  /** Wipes the buffer and the ended sessions. `seq` keeps counting. */
  clear(): void;
  /** Inserts a marker. `INVALID_REQUEST` for an empty or too long label. */
  addMarker(label: string): SpeechEntry;
}

/** Driven by the composition root on a config change, not by the HTTP API. */
export interface ResizeBuffer {
  /**
   * Changes the cap of the speech buffer (`buffer.maxEntries`). A smaller one drops the oldest
   * entries at once.
   */
  setMaxEntries(maxEntries: number): void;
}
