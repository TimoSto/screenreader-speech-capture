import {
  EMPTY_SESSION_STATS,
  isListed,
  summarize,
  type Session,
  type SessionSummary,
} from '../../domain/session.js';
import type { SessionRepository } from '../ports/out/session-repository.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

/**
 * The sessions that are listed (the current one, and ended ones with entries in the buffer),
 * newest first, with what the buffer still holds of them.
 */
export function listSessions(
  sessions: Pick<SessionRepository, 'list'>,
  repository: Pick<SpeechRepository, 'sessionStats'>,
): SessionSummary[] {
  const stats = repository.sessionStats();
  return sessions.list().flatMap((session) => {
    const own = stats.get(session.id) ?? EMPTY_SESSION_STATS;
    return isListed(session, own) ? [summarize(session, own)] : [];
  });
}

/**
 * Forgets the ended sessions whose entries have all left the buffer, so the session list doesn't
 * grow without bound. Called when a session starts or ends: the list grows by one session per
 * test, and reads already skip the unlisted ones.
 */
export function pruneEndedSessions(
  sessions: Pick<SessionRepository, 'removeEnded'>,
  repository: Pick<SpeechRepository, 'sessionStats'>,
): void {
  const stats = repository.sessionStats();
  sessions.removeEnded((session: Session) => stats.has(session.id));
}
