import {
  EMPTY_SESSION_STATS,
  sessionLabel,
  summarize,
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
import { listSessions, pruneEndedSessions } from '../shared/sessions.js';

export interface SessionServiceDeps {
  sessions: SessionRepository;
  repository: Pick<SpeechRepository, 'sessionStats' | 'forgetSession'>;
  events: SpeechEventBus;
  clock: Clock;
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
      sessions: listSessions(this.deps.sessions, this.deps.repository),
      currentId: this.deps.sessions.current()?.id ?? null,
    };
  }

  private endCurrent(now: Date): void {
    const ended = this.deps.sessions.endCurrent(now);
    if (!ended) return;
    const session = summarize(ended, this.deps.repository.sessionStats(ended.id));
    this.deps.events.publish({ type: 'session', session });
    // A session that ended without entries in the buffer is no longer listed.
    pruneEndedSessions(this.deps.sessions, this.deps.repository);
  }
}
