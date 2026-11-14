import type { SessionStats } from '../../../domain/session.js';
import type { BufferStats, SpeechPage } from '../../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

/** Stores speech entries and assigns their `seq`. */
export interface SpeechRepository {
  add(entry: NewSpeechEntry): SpeechEntry;
  /**
   * Entries with `seq > since`, oldest first, at most `limit` (all without it). With `sessionId`,
   * only that session's entries (`null`: the entries outside sessions), and `truncated` only when
   * some of them were dropped.
   */
  list(since: number, limit?: number, sessionId?: number | null): SpeechPage;
  /**
   * Changes the cap. A smaller one drops the oldest entries at once, and they count as truncated
   * like any other dropped entry.
   */
  setMaxEntries(maxEntries: number): void;
  /** Removes all entries. `seq` keeps counting. */
  clear(): void;
  stats(): BufferStats;
  /** What the buffer holds of each session that has entries in it, from one pass over it. */
  sessionStats(): ReadonlyMap<number, SessionStats>;
}
