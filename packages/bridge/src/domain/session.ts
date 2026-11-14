import { invalidField } from './errors.js';

/**
 * Groups the speech of one test or agent task (docs/speech-capture.md#sessions). Only one session
 * is current at a time: the one without `endedAt` that was started last.
 */
export interface Session {
  /** Increasing, restarts at 1 with the bridge. */
  readonly id: number;
  readonly name: string;
  /** Optional label that groups sessions, for example one per test run. */
  readonly run: string | null;
  readonly startedAt: Date;
  /** `null` while the session is current. */
  readonly endedAt: Date | null;
}

/** A session before the speech log has given it an `id`. */
export type NewSession = Pick<Session, 'name' | 'run' | 'startedAt'>;

/** What the buffer still holds of one session. */
export interface SessionStats {
  firstSeq: number | null;
  lastSeq: number | null;
  /** Entries of the session still in the buffer. */
  entries: number;
}

export const EMPTY_SESSION_STATS: SessionStats = { firstSeq: null, lastSeq: null, entries: 0 };

/** A session with what the buffer still holds of it, as listed and in the status. */
export interface SessionSummary extends Session {
  readonly firstSeq: number | null;
  readonly lastSeq: number | null;
  readonly entries: number;
}

/**
 * Which session a read is limited to: an `id`, the session current when the request came, or
 * `none` for the entries recorded outside any session.
 */
export type SessionFilter = number | 'current' | 'none';

export const MAX_SESSION_NAME_LENGTH = 1000;

export function summarize(session: Session, stats: SessionStats): SessionSummary {
  return {
    ...session,
    firstSeq: stats.firstSeq,
    lastSeq: stats.lastSeq,
    entries: stats.entries,
  };
}

/** `name` (required) or `run` (optional), trimmed. `INVALID_REQUEST` if empty or too long. */
export function sessionLabel(field: 'name' | 'run', value: string): string {
  const text = value.trim();
  if (text === '') throw invalidField(field, 'must not be empty');
  if (text.length > MAX_SESSION_NAME_LENGTH) {
    throw invalidField(field, `must be at most ${MAX_SESSION_NAME_LENGTH} characters`);
  }
  return text;
}
