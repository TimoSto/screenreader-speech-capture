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
  // While replaying, new entries are skipped here: the replay reads them from the log. It
  // switches to the live events in the same synchronous block as its last read, and the log
  // publishes each entry synchronously as it adds it, so nothing is missed or sent twice.
  let replaying = since !== null;
  let stopped = false;
  const unsubscribe = events.subscribe((event) => {
    if (event.type !== 'entry') return listener(event);
    if (replaying) return;
    if (sessionId === undefined || event.entry.sessionId === sessionId) listener(event);
  });
  const stop = () => {
    stopped = true;
    unsubscribe();
  };

  if (since === null) return stop;
  let last = since;
  /** Replays from `last` until `pace` pauses it (its promise) or it has caught up. */
  const step = (): Promise<void> | undefined => {
    for (;;) {
      const { entries, truncated, hasMore } = log.page(last, REPLAY_PAGE, sessionId);
      if (truncated) listener({ type: 'truncated' });
      for (const entry of entries) {
        listener({ type: 'entry', entry });
        last = entry.seq;
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
      // Reads again from `last`: the log may have changed meanwhile.
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
