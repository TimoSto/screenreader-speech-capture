import { sessionLabel, type SessionSummary } from '../../domain/session.js';
import type { SpeechLog } from '../../domain/speech-log.js';
import type {
  ManageSessions,
  SessionList,
  StartSessionOptions,
} from '../ports/in/manage-sessions.js';
import type { Clock } from '../ports/out/clock.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';

export interface SessionServiceDeps {
  log: Pick<SpeechLog, 'startSession' | 'endSession' | 'sessions' | 'currentSession'>;
  events: SpeechEventBus;
  clock: Clock;
}

/**
 * Starting, ending and listing sessions (docs/speech-capture.md#sessions). Each start and end is
 * published as a `session` event. The speech log gives entries their `sessionId`.
 */
export class SessionService implements ManageSessions {
  constructor(private readonly deps: SessionServiceDeps) {}

  start({ name, run }: StartSessionOptions): SessionSummary {
    const label = sessionLabel('name', name);
    const group = run === undefined || run === null ? null : sessionLabel('run', run);
    const { ended, started } = this.deps.log.startSession({
      name: label,
      run: group,
      startedAt: this.deps.clock.now(),
    });
    if (ended) this.deps.events.publish({ type: 'session', session: ended });
    this.deps.events.publish({ type: 'session', session: started });
    return started;
  }

  end(): void {
    const ended = this.deps.log.endSession(this.deps.clock.now());
    if (ended) this.deps.events.publish({ type: 'session', session: ended });
  }

  list(): SessionList {
    return {
      sessions: this.deps.log.sessions(),
      currentId: this.deps.log.currentSession()?.id ?? null,
    };
  }
}
