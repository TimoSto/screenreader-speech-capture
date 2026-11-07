import type { BufferStats, SpeechPage } from '../../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

/** Stores speech entries and assigns their `seq`. */
export interface SpeechRepository {
  add(entry: NewSpeechEntry): SpeechEntry;
  /** Entries with `seq > since`, oldest first, at most `limit`. */
  list(since: number, limit: number): SpeechPage;
  /** Removes all entries. `seq` keeps counting. */
  clear(): void;
  /** Changes the capacity. Drops the oldest entries if there are too many. */
  resize(maxEntries: number): void;
  stats(): BufferStats;
}
