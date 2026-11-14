import type { SpeechRepository } from '../../../application/ports/out/speech-repository.js';
import type { SessionStats } from '../../../domain/session.js';
import type { BufferStats, SpeechPage } from '../../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

/**
 * In-memory list of speech entries, oldest first, capped at `maxEntries`: when full, the oldest
 * entry is dropped (docs/speech-capture.md#buffer). `seq` keeps counting across clears.
 */
export class MemorySpeechRepository implements SpeechRepository {
  private entries: SpeechEntry[] = [];
  private nextSeq: number;
  /** Highest `seq` dropped because the list was full, since the last clear. */
  private droppedUpToSeq = 0;
  /** The same per session id (`null`: entries outside sessions), for a session's `truncated`. */
  private readonly dropped = new Map<number | null, number>();

  /**
   * `firstSeq`: the first entry's `seq`. The bridge passes its start time in ms, so `seq` keeps
   * rising across restarts and a `seq` from an earlier run reads the new run from its start.
   */
  constructor(
    private maxEntries: number,
    firstSeq = 1,
  ) {
    this.nextSeq = firstSeq;
  }

  add(entry: NewSpeechEntry): SpeechEntry {
    const stored: SpeechEntry = { ...entry, seq: this.nextSeq++ };
    this.entries.push(stored);
    this.trim();
    return stored;
  }

  list(since: number, limit?: number, sessionId?: number | null): SpeechPage {
    const after = this.entries.filter(
      (entry) => entry.seq > since && (sessionId === undefined || entry.sessionId === sessionId),
    );
    const droppedUpToSeq =
      sessionId === undefined ? this.droppedUpToSeq : (this.dropped.get(sessionId) ?? 0);
    return {
      entries: limit === undefined ? after : after.slice(0, limit),
      truncated: since < droppedUpToSeq,
      hasMore: limit !== undefined && after.length > limit,
    };
  }

  /**
   * Changes the cap (`buffer.maxEntries`). A smaller one drops the oldest entries right away, and
   * they count as truncated like any other dropped entry.
   */
  setMaxEntries(maxEntries: number): void {
    this.maxEntries = maxEntries;
    this.trim();
  }

  clear(): void {
    this.entries = [];
    this.droppedUpToSeq = 0;
    this.dropped.clear();
  }

  sessionStats(): ReadonlyMap<number, SessionStats> {
    const stats = new Map<number, SessionStats>();
    for (const { sessionId, seq } of this.entries) {
      if (sessionId === null) continue;
      const session = stats.get(sessionId);
      if (session) {
        session.lastSeq = seq;
        session.entries++;
      } else {
        stats.set(sessionId, { firstSeq: seq, lastSeq: seq, entries: 1 });
      }
    }
    return stats;
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
    const excess = this.entries.length - this.maxEntries;
    if (excess <= 0) return;
    for (const { seq, sessionId } of this.entries.splice(0, excess)) {
      this.droppedUpToSeq = seq;
      this.dropped.set(sessionId, seq);
    }
  }
}
