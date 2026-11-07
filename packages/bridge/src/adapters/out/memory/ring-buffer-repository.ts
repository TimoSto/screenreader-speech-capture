import type {
  BufferStats,
  SpeechPage,
  SpeechRepository,
} from '../../../application/ports/out/speech-repository.js';
import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

/**
 * In-memory ring buffer (docs/speech-capture.md#buffer). When it is full, the oldest entries
 * are dropped. `seq` keeps counting across clears.
 */
export class RingBufferRepository implements SpeechRepository {
  /** Entries in `seq` order. Indexes before `start` are dropped and compacted away later. */
  private entries: SpeechEntry[] = [];
  private start = 0;
  private nextSeq = 1;
  /** Highest `seq` dropped because the buffer was full, since the last clear. */
  private droppedUpToSeq = 0;

  constructor(private maxEntries: number) {}

  add(entry: NewSpeechEntry): SpeechEntry {
    const stored: SpeechEntry = { ...entry, seq: this.nextSeq++ };
    this.entries.push(stored);
    this.dropOverflow();
    return stored;
  }

  list(since: number, limit: number): SpeechPage {
    const from = this.indexAfter(since);
    return {
      entries: this.entries.slice(from, from + limit),
      truncated: since < this.droppedUpToSeq,
    };
  }

  clear(): void {
    this.entries = [];
    this.start = 0;
    this.droppedUpToSeq = 0;
  }

  resize(maxEntries: number): void {
    this.maxEntries = maxEntries;
    this.dropOverflow();
  }

  stats(): BufferStats {
    const size = this.entries.length - this.start;
    return {
      size,
      maxEntries: this.maxEntries,
      firstSeq: size > 0 ? this.entries[this.start]!.seq : null,
      lastSeq: size > 0 ? this.entries[this.entries.length - 1]!.seq : null,
    };
  }

  private dropOverflow(): void {
    while (this.entries.length - this.start > this.maxEntries) {
      this.droppedUpToSeq = this.entries[this.start]!.seq;
      this.start++;
    }
    // Compact once the dropped part is as big as the live part, so dropping stays O(1) amortized.
    if (this.start > 0 && this.start >= this.entries.length - this.start) {
      this.entries = this.entries.slice(this.start);
      this.start = 0;
    }
  }

  /** Index of the first live entry with `seq > since` (binary search, entries are sorted). */
  private indexAfter(since: number): number {
    let low = this.start;
    let high = this.entries.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.entries[mid]!.seq <= since) low = mid + 1;
      else high = mid;
    }
    return low;
  }
}
