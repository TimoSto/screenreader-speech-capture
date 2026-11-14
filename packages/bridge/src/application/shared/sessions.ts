import { isListed, summarize, type Session, type SessionSummary } from '../../domain/session.js';
import type { SessionRepository } from '../ports/out/session-repository.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

type SessionStatsSource = Pick<SpeechRepository, 'sessionStats'>;

/**
 * The sessions that are listed (the current one, and ended ones with entries in the buffer),
 * newest first, with what the buffer still holds of them. Changes nothing: ended sessions are
 * pruned by the writes that can empty them (`pruneEndedSessions`).
 */
export function listSessions(
  sessions: Pick<SessionRepository, 'list'>,
  repository: SessionStatsSource,
): SessionSummary[] {
  return sessions.list().flatMap((session) => {
    const stats = repository.sessionStats(session.id);
    return isListed(session, stats) ? [summarize(session, stats)] : [];
  });
}

/**
 * Removes the ended sessions whose entries were all dropped from both repositories, so neither
 * grows without bound and the session repository doesn't have to follow the buffer. Called after
 * every write that can empty a session: an entry that pushes the oldest out of the full buffer, a
 * smaller `buffer.maxEntries`, and the end of a session.
 */
export function pruneEndedSessions(
  sessions: Pick<SessionRepository, 'removeEnded'>,
  repository: Pick<SpeechRepository, 'sessionStats' | 'forgetSession'>,
): void {
  const keep = (session: Session) => isListed(session, repository.sessionStats(session.id));
  for (const session of sessions.removeEnded(keep)) repository.forgetSession(session.id);
}
