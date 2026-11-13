import { isListed, summarize, type Session, type SessionSummary } from '../../domain/session.js';
import type { SessionRepository } from '../ports/out/session-repository.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

/**
 * The sessions that are listed, newest first, with what the buffer still holds of them.
 *
 * Side effect: ended sessions whose entries were all dropped are removed from both repositories
 * first. That is how sessions get garbage-collected, so neither repository grows without bound and
 * the session repository doesn't have to follow the buffer. Every read of the session list
 * (`GET /sessions`, `GET /status`) goes through here.
 */
export function pruneAndListSessions(
  sessions: SessionRepository,
  repository: Pick<SpeechRepository, 'sessionStats' | 'forgetSession'>,
): SessionSummary[] {
  const stats = (session: Session) => repository.sessionStats(session.id);
  const removed = sessions.removeEnded((session) => isListed(session, stats(session)));
  for (const session of removed) repository.forgetSession(session.id);
  return sessions.list().map((session) => summarize(session, stats(session)));
}
