import type { SessionSummary } from '../../../domain/session.js';

export interface StartSessionOptions {
  name: string;
  run?: string | null | undefined;
  /** Who starts it, for telling clients apart. `null` or missing: unknown. */
  client?: string | null | undefined;
}

export interface StartedSession {
  session: SessionSummary;
  /**
   * The session this start ended, if another client had started it (by `client`): two clients
   * share one screen reader. `null` if none was current or it was the same client's.
   */
  replaced: SessionSummary | null;
}

export interface SessionList {
  /** The current session and the ended ones with entries in the buffer, newest first. */
  sessions: SessionSummary[];
  currentId: number | null;
}

/** Sessions group the speech of one test or agent task (docs/usage/speech-capture.md#sessions). */
export interface ManageSessions {
  /**
   * Ends the current session, if any, and starts a new current one. Rejects with
   * `INVALID_REQUEST` for an empty or too long `name`, `run` or `client`. Never refuses because
   * another client's session is current: that is logged as a warning and returned as `replaced`.
   */
  start(options: StartSessionOptions): StartedSession;
  /**
   * Ends the current session. Does nothing if none is current. Ending another client's session
   * is logged as a warning.
   */
  end(client?: string | null): void;
  list(): SessionList;
}
