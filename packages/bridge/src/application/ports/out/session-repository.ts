import type { NewSession, Session } from '../../../domain/session.js';

/** Stores sessions and assigns their `id`. At most one is current. */
export interface SessionRepository {
  /** Stores a new session, which becomes current. The caller ends the previous one first. */
  create(session: NewSession): Session;
  /** Ends the current session and returns it, `null` if none was current. */
  endCurrent(endedAt: Date): Session | null;
  current(): Session | null;
  get(id: number): Session | undefined;
  /** The highest `id` given out so far, `0` before the first session. */
  lastId(): number;
  /** All stored sessions, newest first. */
  list(): Session[];
  /**
   * Forgets the ended sessions for which `keep` is `false` and returns them. The current one
   * always stays.
   */
  removeEnded(keep: (session: Session) => boolean): Session[];
}
