import { AppError, invalidField } from '../../domain/errors.js';
import type { SessionFilter } from '../../domain/session.js';
import type { SessionRepository } from '../ports/out/session-repository.js';

/**
 * The session `id` a read is limited to, `undefined` without a filter. `current` becomes the
 * current session's id now. `NOT_FOUND` for `current` with none current, or an id never given
 * out. An ended session whose entries were all dropped is found: it just has no entries.
 */
export function resolveSessionFilter(
  filter: SessionFilter | undefined,
  sessions: Pick<SessionRepository, 'current' | 'lastId'>,
): number | undefined {
  if (filter === undefined) return undefined;
  if (filter === 'current') {
    const current = sessions.current();
    if (!current) throw new AppError('NOT_FOUND', 'No session is current');
    return current.id;
  }
  if (!Number.isSafeInteger(filter) || filter < 1) {
    throw invalidField('session', 'must be a session id or current');
  }
  if (filter > sessions.lastId()) {
    throw new AppError('NOT_FOUND', `Session ${filter} does not exist`, { session: filter });
  }
  return filter;
}
