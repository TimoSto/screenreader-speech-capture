import { AppError, invalidField } from './errors.js';
import { SeqQueue } from './seq-queue.js';
import {
  EMPTY_SESSION_STATS,
  summarize,
  type NewSession,
  type Session,
  type SessionFilter,
  type SessionStats,
  type SessionSummary,
} from './session.js';
import type { BufferStats, SpeechPage } from './speech-buffer.js';
import type { SpeechEntry } from './speech-entry.js';

/** A speech entry before the log has given it a `seq` and a `sessionId`. */
export type SpeechDraft = Omit<SpeechEntry, 'seq' | 'sessionId'>;

/** What starting a session did: the session it ended (if one was current), and the new one. */
export interface SessionStart {
  ended: SessionSummary | null;
  started: SessionSummary;
}

/**
 * The bridge's speech and sessions (docs/usage/speech-capture.md#buffer, #sessions), the one owner
 * of their rules:
 *
 * - Every entry gets the next `seq` and the current session's id. `seq` keeps counting across
 *   clears and starts at `firstSeq` (the bridge passes its start time, so it rises across
 *   restarts).
 * - The entries are capped at `maxEntries`: the oldest are dropped, and reading from before a
 *   dropped one is `truncated` (per session for a session's reads).
 * - At most one session is current. The log keeps the current session and the ended ones with
 *   entries still in the buffer; an ended session is forgotten once its last entry is dropped or
 *   cleared, and `id`s are never given out twice.
 *
 * Adding, dropping and the session statistics are O(1), reading after a `seq` is O(log n).
 */
export class SpeechLog {
  readonly #entries = new SeqQueue<SpeechEntry>();
  /** The same entries per session id (`null`: outside sessions), for session reads and stats. */
  readonly #bySession = new Map<number | null, SeqQueue<SpeechEntry>>();
  #maxEntries: number;
  #nextSeq: number;
  /** Highest `seq` dropped because the buffer was full, since the last clear. */
  #droppedUpToSeq = 0;
  /** The same per session id (`null`: entries outside sessions), for a session's `truncated`. */
  readonly #droppedBySession = new Map<number | null, number>();

  /** The current session and the ended ones with entries, oldest first. */
  readonly #sessions = new Map<number, Session>();
  #currentId: number | null = null;
  #lastSessionId = 0;

  constructor(maxEntries: number, firstSeq = 1) {
    this.#maxEntries = maxEntries;
    this.#nextSeq = firstSeq;
  }

  /** Stores an entry in the current session (if any) and returns it with its `seq`. */
  append(draft: SpeechDraft): SpeechEntry {
    const entry: SpeechEntry = { ...draft, seq: this.#nextSeq++, sessionId: this.#currentId };
    this.#entries.push(entry);
    let own = this.#bySession.get(entry.sessionId);
    if (!own) {
      own = new SeqQueue();
      this.#bySession.set(entry.sessionId, own);
    }
    own.push(entry);
    this.#trim();
    return entry;
  }

  /**
   * Entries with `seq > since`, oldest first, at most `limit` (all without it). With
   * `sessionId`, only that session's entries (`null`: the entries outside sessions), and
   * `truncated` only when some of them were dropped.
   */
  page(since: number, limit?: number, sessionId?: number | null): SpeechPage {
    const queue = sessionId === undefined ? this.#entries : this.#bySession.get(sessionId);
    const droppedUpToSeq =
      sessionId === undefined ? this.#droppedUpToSeq : (this.#droppedBySession.get(sessionId) ?? 0);
    const { items, hasMore } = queue?.after(since, limit) ?? { items: [], hasMore: false };
    return { entries: items, truncated: since < droppedUpToSeq, hasMore };
  }

  /** Changes the cap. A smaller one drops the oldest entries at once, as truncated. */
  resize(maxEntries: number): void {
    this.#maxEntries = maxEntries;
    this.#trim();
  }

  /** Removes all entries and the ended sessions. The current session stays current. */
  clear(): void {
    this.#entries.clear();
    this.#bySession.clear();
    this.#droppedUpToSeq = 0;
    this.#droppedBySession.clear();
    for (const session of this.#sessions.values()) {
      if (session.endedAt !== null) this.#sessions.delete(session.id);
    }
  }

  stats(): BufferStats {
    return {
      size: this.#entries.size,
      maxEntries: this.#maxEntries,
      firstSeq: this.#entries.first()?.seq ?? null,
      lastSeq: this.#entries.last()?.seq ?? null,
    };
  }

  /** Ends the current session, if any, and starts a new current one. */
  startSession(session: NewSession): SessionStart {
    const ended = this.endSession(session.startedAt);
    const started: Session = {
      ...session,
      id: ++this.#lastSessionId,
      endedAt: null,
      startSeq: this.#nextSeq - 1,
    };
    this.#sessions.set(started.id, started);
    this.#currentId = started.id;
    return { ended, started: summarize(started, EMPTY_SESSION_STATS) };
  }

  /** Ends the current session and returns it, `null` if none was current. */
  endSession(endedAt: Date): SessionSummary | null {
    const current = this.currentSession();
    if (!current) return null;
    const ended: Session = { ...current, endedAt };
    this.#currentId = null;
    const stats = this.#statsOf(ended.id);
    if (stats.entries > 0) this.#sessions.set(ended.id, ended);
    else this.#sessions.delete(ended.id);
    return summarize(ended, stats);
  }

  currentSession(): Session | null {
    return this.#currentId === null ? null : (this.#sessions.get(this.#currentId) ?? null);
  }

  /** The current session and the ended ones with entries in the buffer, newest first. */
  sessions(): SessionSummary[] {
    return [...this.#sessions.values()]
      .reverse()
      .map((session) => summarize(session, this.#statsOf(session.id)));
  }

  /**
   * The session `id` a read is limited to, `null` for the entries outside sessions (`none`),
   * `undefined` without a filter. `current` becomes the current session's id now. `NOT_FOUND` for
   * `current` with none current, or an id never given out. An ended session whose entries were all
   * dropped is found: it just has no entries.
   */
  resolveFilter(filter: SessionFilter | undefined): number | null | undefined {
    if (filter === undefined) return undefined;
    if (filter === 'none') return null;
    if (filter === 'current') {
      if (this.#currentId === null) throw new AppError('NOT_FOUND', 'No session is current');
      return this.#currentId;
    }
    if (!Number.isSafeInteger(filter) || filter < 1) {
      throw invalidField('session', 'must be a session id, current or none');
    }
    if (filter > this.#lastSessionId) {
      throw new AppError('NOT_FOUND', `Session ${filter} does not exist`, { session: filter });
    }
    return filter;
  }

  #statsOf(sessionId: number): SessionStats {
    const queue = this.#bySession.get(sessionId);
    if (!queue) return EMPTY_SESSION_STATS;
    return { firstSeq: queue.first()!.seq, lastSeq: queue.last()!.seq, entries: queue.size };
  }

  /** Drops the oldest entries over the cap. */
  #trim(): void {
    while (this.#entries.size > this.#maxEntries) {
      const { seq, sessionId } = this.#entries.shift()!;
      this.#droppedUpToSeq = seq;
      this.#droppedBySession.set(sessionId, seq);
      const own = this.#bySession.get(sessionId)!;
      own.shift();
      if (own.size > 0) continue;
      this.#bySession.delete(sessionId);
      // An ended session without entries is forgotten (its id stays taken).
      const session = sessionId === null ? undefined : this.#sessions.get(sessionId);
      if (session && session.endedAt !== null) this.#sessions.delete(session.id);
    }
  }
}
