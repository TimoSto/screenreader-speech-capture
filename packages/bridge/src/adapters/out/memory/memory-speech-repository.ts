import type { SpeechRepository } from '../../../application/ports/out/speech-repository.js';
import { EMPTY_SESSION_STATS, type SessionStats } from '../../../domain/session.js';
import type { BufferStats, SpeechPage } from '../../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../../domain/speech-entry.js';

/**
 * In-memory list of speech entries, oldest first, capped at `maxEntries`: when full, the oldest
 * entry is dropped (docs/speech-capture.md#buffer). `seq` keeps counting across clears.
 *
 * It also keeps the stats of each session. Only one session is current at a time and ids only
 * increase, so the entries of one session are always one unbroken run of the list: when its
 * first entry is dropped, the next entry in the list is either its new first or not its own.
 */
export class MemorySpeechRepository implements SpeechRepository {
  private entries: SpeechEntry[] = [];
  private nextSeq = 1;
  /** Highest `seq` dropped because the list was full, since the last clear. */
  private droppedUpToSeq = 0;
  /** The same for entries outside sessions (`sessionId: null`). */
  private outsideDroppedUpToSeq = 0;
  /** Stats of the sessions with entries since the last clear, until they are forgotten. */
  private sessions = new Map<number, SessionStats>();

  constructor(private maxEntries: number) {}

  add(entry: NewSpeechEntry): SpeechEntry {
    const stored: SpeechEntry = { ...entry, seq: this.nextSeq++ };
    this.entries.push(stored);
    if (stored.sessionId !== null) {
      const stats = this.sessions.get(stored.sessionId) ?? { ...EMPTY_SESSION_STATS };
      stats.firstSeq ??= stored.seq;
      stats.lastSeq = stored.seq;
      stats.entries++;
      this.sessions.set(stored.sessionId, stats);
    }
    this.trim();
    return stored;
  }

  list(since: number, limit?: number, sessionId?: number | null): SpeechPage {
    const after = this.entries.filter(
      (entry) => entry.seq > since && (sessionId === undefined || entry.sessionId === sessionId),
    );
    const droppedUpToSeq =
      sessionId === undefined
        ? this.droppedUpToSeq
        : sessionId === null
          ? this.outsideDroppedUpToSeq
          : this.sessionStats(sessionId).droppedUpToSeq;
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
    this.outsideDroppedUpToSeq = 0;
    this.sessions.clear();
  }

  sessionStats(sessionId: number): SessionStats {
    return { ...(this.sessions.get(sessionId) ?? EMPTY_SESSION_STATS) };
  }

  forgetSession(sessionId: number): void {
    this.sessions.delete(sessionId);
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
      const dropped = this.entries.shift()!;
      this.droppedUpToSeq = dropped.seq;
      if (dropped.sessionId === null) this.outsideDroppedUpToSeq = dropped.seq;
      const stats = dropped.sessionId === null ? undefined : this.sessions.get(dropped.sessionId);
      if (!stats) continue;
      stats.entries--;
      stats.droppedUpToSeq = dropped.seq;
      // The run is unbroken: the next entry is the session's new first, if it has any left.
      stats.firstSeq = stats.entries === 0 ? null : this.entries[0]!.seq;
      if (stats.entries === 0) stats.lastSeq = null;
    }
  }
}
