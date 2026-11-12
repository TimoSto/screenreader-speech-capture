import type { SessionSummary } from '../../../domain/session.js';

export interface StartSessionOptions {
  name: string;
  run?: string | null | undefined;
}

export interface SessionList {
  /** The current session and the ended ones with entries in the buffer, newest first. */
  sessions: SessionSummary[];
  currentId: number | null;
}

/** Sessions group the speech of one test or agent task (docs/speech-capture.md#sessions). */
export interface ManageSessions {
  /**
   * Ends the current session, if any, and starts a new current one. Rejects with
   * `INVALID_REQUEST` for an empty or too long `name` or `run`.
   */
  start(options: StartSessionOptions): SessionSummary;
  /** Ends the current session. Does nothing if none is current. */
  end(): void;
  list(): SessionList;
}
