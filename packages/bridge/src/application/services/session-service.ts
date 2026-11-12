import {
  EMPTY_SESSION_STATS,
  isListed,
  sessionLabel,
  summarize,
  type Session,
  type SessionSummary,
} from '../../domain/session.js';
import type {
  ManageSessions,
  SessionList,
  StartSessionOptions,
} from '../ports/in/manage-sessions.js';
import type { Clock } from '../ports/out/clock.js';
import type { SessionRepository } from '../ports/out/session-repository.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

export interface SessionServiceDeps {
  sessions: SessionRepository;
  repository: Pick<SpeechRepository, 'sessionStats' | 'forgetSession'>;
  events: SpeechEventBus;
  clock: Clock;
}

/**
 * The sessions that are listed, newest first, with what the buffer still holds of them. Ended
 * sessions whose entries were all dropped are forgotten here, so neither repository grows
 * without bound and the session repository doesn't have to follow the buffer.
 */
export function listedSessions(
  sessions: SessionRepository,
  repository: Pick<SpeechRepository, 'sessionStats' | 'forgetSession'>,
): SessionSummary[] {
  const stats = (session: Session) => repository.sessionStats(session.id);
  const removed = sessions.removeEnded((session) => isListed(session, stats(session)));
  for (const session of removed) repository.forgetSession(session.id);
  return sessions.list().map((session) => summarize(session, stats(session)));
}

/**
 * Starting, ending and listing sessions (docs/speech-capture.md#sessions). Each start and end is
 * published as a `session` event. Entries get their `sessionId` in `SpeechService`.
 */
export class SessionService implements ManageSessions {
  constructor(private readonly deps: SessionServiceDeps) {}

  start({ name, run }: StartSessionOptions): SessionSummary {
    const label = sessionLabel('name', name);
    const group = run === undefined || run === null ? null : sessionLabel('run', run);
    const now = this.deps.clock.now();
    this.endCurrent(now);
    const created = this.deps.sessions.create({ name: label, run: group, startedAt: now });
    const session = summarize(created, EMPTY_SESSION_STATS);
    this.deps.events.publish({ type: 'session', session });
    return session;
  }

  end(): void {
    this.endCurrent(this.deps.clock.now());
  }

  list(): SessionList {
    return {
      sessions: listedSessions(this.deps.sessions, this.deps.repository),
      currentId: this.deps.sessions.current()?.id ?? null,
    };
  }

  private endCurrent(now: Date): void {
    const ended = this.deps.sessions.endCurrent(now);
    if (!ended) return;
    const session = summarize(ended, this.deps.repository.sessionStats(ended.id));
    this.deps.events.publish({ type: 'session', session });
  }
}
