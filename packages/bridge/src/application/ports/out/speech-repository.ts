import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

export interface SpeechPage {
  entries: SpeechEntry[];
  /** `true` when entries after `since` were dropped because the buffer was full. */
  truncated: boolean;
}

export interface BufferStats {
  size: number;
  maxEntries: number;
  firstSeq: number | null;
  lastSeq: number | null;
}

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
