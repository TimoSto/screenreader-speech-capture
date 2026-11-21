import { MAX_ROWS, type FeedState, type SpeechApi, type SpeechFeed } from '#lib/core/speech.js';
import type { SessionScope } from '#lib/core/sessions.js';
import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';

/** The speech of one scope: streamed from `open` until the returned function is called. */
export function createSpeechStore(feed: SpeechFeed, api: SpeechApi) {
  let entries = $state.raw<SpeechEntryDto[]>([]);
  let connection = $state<FeedState>('connecting');
  let close: (() => void) | null = null;

  function stop(): void {
    close?.();
    close = null;
  }

  /** Adds entries newer than the last one shown (a replay after a reconnect repeats some). */
  function append(added: readonly SpeechEntryDto[]): void {
    let lastSeq = entries.at(-1)?.seq ?? 0;
    const fresh: SpeechEntryDto[] = [];
    for (const entry of added) {
      if (entry.seq <= lastSeq) continue;
      fresh.push(entry);
      lastSeq = entry.seq;
    }
    if (fresh.length === 0) return;
    const next = [...entries, ...fresh];
    entries = next.length > MAX_ROWS ? next.slice(next.length - MAX_ROWS) : next;
  }

  return {
    get entries() {
      return entries;
    },
    get connection() {
      return connection;
    },

    /**
     * Shows the speech of `scope`, replacing what was shown. A live scope replays the buffer and
     * follows; an ended session is read once. After a reconnect the stream resumes where it left
     * off, and an entry seen twice is dropped. Returns the function that stops the stream.
     */
    open(scope: SessionScope, live: boolean): () => void {
      stop();
      entries = [];
      connection = 'connecting';
      close = feed.open(scope, live, {
        onEntry: (entry) => append([entry]),
        onEntries: append,
        onClear() {
          entries = [];
        },
        onState(state) {
          connection = state;
        },
      });
      return stop;
    },

    /** Rejects with the reason; the new entry arrives through the feed, so nothing is added here. */
    addMarker(label: string): Promise<void> {
      return api.addMarker(label);
    },
  };
}
