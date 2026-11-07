import type { SpeechRepository } from '../../../application/ports/out/speech-repository.js';
import type { BufferStats, SpeechPage } from '../../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

/**
 * In-memory list of speech entries, oldest first, capped at `maxEntries`: when full, the oldest
 * entry is dropped (docs/speech-capture.md#buffer). `seq` keeps counting across clears.
 */
export class MemorySpeechRepository implements SpeechRepository {
  private entries: SpeechEntry[] = [];
  private nextSeq = 1;
  /** Highest `seq` dropped because the list was full, since the last clear. */
  private droppedUpToSeq = 0;

  constructor(private maxEntries: number) {}

  add(entry: NewSpeechEntry): SpeechEntry {
    const stored: SpeechEntry = { ...entry, seq: this.nextSeq++ };
    this.entries.push(stored);
    this.trim();
    return stored;
  }

  list(since: number, limit: number): SpeechPage {
    return {
      entries: this.entries.filter((entry) => entry.seq > since).slice(0, limit),
      truncated: since < this.droppedUpToSeq,
    };
  }

  clear(): void {
    this.entries = [];
    this.droppedUpToSeq = 0;
  }

  resize(maxEntries: number): void {
    this.maxEntries = maxEntries;
    this.trim();
  }

  stats(): BufferStats {
    return {
      size: this.entries.length,
      maxEntries: this.maxEntries,
      firstSeq: this.entries[0]?.seq ?? null,
      lastSeq: this.entries.at(-1)?.seq ?? null,
    };
  }

  private trim(): void {
    while (this.entries.length > this.maxEntries) {
      this.droppedUpToSeq = this.entries.shift()!.seq;
    }
  }
}
