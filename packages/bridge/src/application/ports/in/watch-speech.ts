import type { SessionFilter } from '../../../domain/session.js';
import type { SpeechEvent } from '../../../domain/speech-event.js';

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
}

export interface WatchSpeech {
  /**
   * Calls `listener` with every new entry and clear, until the returned function is called.
   * With `since`, it first gets the buffered entries with `seq > since` (an SSE reconnect with
   * `Last-Event-ID`), with nothing missed or repeated in between. If some of them were already
   * dropped, a `truncated` event comes first. Throws `NOT_FOUND` for an unknown session, before
   * calling `listener`.
   */
  watch(since: number | null, listener: WatchListener, options?: WatchOptions): () => void;
}
