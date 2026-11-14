import { SeqCursor } from '../../domain/seq-cursor.js';
import type { SpeechLog } from '../../domain/speech-log.js';
import type { WatchListener } from '../ports/in/speech.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';

/** Entries a replay reads from the log at a time. */
export const REPLAY_PAGE = 500;

export interface FollowOptions {
  /**
   * Called after each replayed entry. A promise pauses the replay until it resolves. Without it,
   * the replay runs in one synchronous block.
   */
  pace?: (() => Promise<void> | undefined) | undefined;
  /** A listener that throws after the replay paused ends the follow, and the error lands here. */
  onError?: ((error: unknown) => void) | undefined;
}

/**
 * Hands `listener` the log's entries after `since` (none for `null`), then the new events, with
 * nothing missed or repeated in between (`SpeechUseCases.watch`, the wait). With `sessionId`, only
 * that session's entries (`null`: those outside sessions); `clear` and `session` events always
 * come. Returns a function that stops it; calling it again does nothing.
 */
export function followLog(
  deps: { log: Pick<SpeechLog, 'page'>; events: SpeechEventBus },
  { since, sessionId }: { since: number | null; sessionId: number | null | undefined },
  listener: WatchListener,
  { pace, onError }: FollowOptions = {},
): () => void {
  const { log, events } = deps;
  // Subscribed before the replay reads anything, so every entry is either in the log when the
  // replay reads it, or published afterwards and delivered by the bus. While replaying, live
  // entries are skipped: the replay reads them from the log, in order. After it, the cursor drops
  // an entry the replay already read but the bus delivers late. That holds for any bus that
  // delivers in publish order, at once or later (the `SpeechEventBus` contract).
  const cursor = new SeqCursor(since ?? Number.NEGATIVE_INFINITY);
  let replaying = since !== null;
  let stopped = false;
  const unsubscribe = events.subscribe((event) => {
    if (event.type !== 'entry') return listener(event);
    if (replaying || !cursor.advance(event.entry)) return;
    if (sessionId === undefined || event.entry.sessionId === sessionId) listener(event);
  });
  const stop = () => {
    stopped = true;
    unsubscribe();
  };

  if (since === null) return stop;
  /** Replays from the cursor until `pace` pauses it (its promise) or it has caught up. */
  const step = (): Promise<void> | undefined => {
    for (;;) {
      const { entries, truncated, hasMore } = log.page(cursor.position, REPLAY_PAGE, sessionId);
      if (truncated) listener({ type: 'truncated' });
      for (const entry of entries) {
        if (!cursor.advance(entry)) continue;
        listener({ type: 'entry', entry });
        const paused = pace?.();
        if (paused) return paused;
      }
      if (!hasMore) {
        replaying = false;
        return undefined;
      }
    }
  };
  const resume = async (paused: Promise<void>) => {
    for (let next: Promise<void> | undefined = paused; next;) {
      await next;
      if (stopped) return;
      // Reads again from the cursor: the log may have changed meanwhile.
      next = step();
    }
  };

  let paused: Promise<void> | undefined;
  try {
    // Until the first pause, an error belongs to the caller of `watch`.
    paused = step();
  } catch (error) {
    stop();
    throw error;
  }
  if (paused) {
    resume(paused).catch((error: unknown) => {
      stop();
      onError?.(error);
    });
  }
  return stop;
}
