/** The speech of one test or agent task (docs/usage/speech-capture.md#sessions). */
export interface Session {
  /** Increasing, restarts at 1 with the bridge. */
  id: number;
  name: string;
  /** Optional label that groups sessions (for example one test run), `null` if not set. */
  run: string | null;
  /** The client that started it (its `clientName`), `null` if unknown. */
  client: string | null;
  /** ISO 8601, UTC, on the bridge's clock. */
  startedAt: string;
  /** ISO 8601, UTC. `null` while the session is current. */
  endedAt: string | null;
  /** The last `seq` before the session started: `since: startSeq` reads it from its start. */
  startSeq: number;
  /** First and last entry still in the buffer, `null` if none. */
  firstSeq: number | null;
  lastSeq: number | null;
  /** Entries of this session still in the buffer. */
  entries: number;
}

/** A session just started, with the session of another client it replaced, if any. */
export interface StartedSession extends Session {
  /**
   * The session this start ended, if another client had started it: two clients (for example
   * two test workers) are sharing one screen reader. `null` otherwise.
   */
  replaced: Session | null;
}

/** A session `id`, or `'current'`: the session that is current when the request arrives. */
export type SessionRef = number | 'current';

/** The sessions still in the bridge's buffer plus the current one, newest first. */
export interface SessionList {
  sessions: Session[];
  /** `null` when no session is current. */
  currentId: number | null;
}
