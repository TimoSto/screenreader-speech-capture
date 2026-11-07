import type { SpeechEntry } from './speech-entry.js';

/** A page of the speech buffer: entries after a given `seq`, oldest first. */
export interface SpeechPage {
  entries: SpeechEntry[];
  /** `true` when entries after `since` were dropped because the buffer was full. */
  truncated: boolean;
  /** `true` when there are more entries after the last one: ask again with its `seq` as `since`. */
  hasMore: boolean;
}

/** Size and `seq` range of the speech buffer, for the status. */
export interface BufferStats {
  size: number;
  maxEntries: number;
  firstSeq: number | null;
  lastSeq: number | null;
}
