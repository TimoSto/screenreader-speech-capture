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
  /** Removes all entries. `seq` keeps counting. */
  clear(): void;
  stats(): BufferStats;
  /** What the buffer still holds of one session (empty stats for an unknown one). */
  sessionStats(sessionId: number): SessionStats;
  /** Drops the stats of a session that is no longer listed, so they don't pile up. */
  forgetSession(sessionId: number): void;
}
