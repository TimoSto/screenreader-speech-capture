import { sessionLabel } from '../../domain/session.js';
import type { SpeechLog } from '../../domain/speech-log.js';
import type {
  ManageSessions,
  SessionList,
  StartedSession,
  StartSessionOptions,
} from '../ports/in/manage-sessions.js';
import type { Clock } from '../ports/out/clock.js';
import type { Logger } from '../ports/out/logger.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';

export interface SessionServiceDeps {
  log: Pick<SpeechLog, 'startSession' | 'endSession' | 'sessions' | 'currentSession'>;
  events: SpeechEventBus;
  clock: Pick<Clock, 'now'>;
  logger: Logger;
}

const describe = (session: { id: number; name: string; client: string | null }) =>
  `session ${session.id} "${session.name}" (client ${session.client ?? 'unknown'})`;

/**
 * Starting, ending and listing sessions (docs/speech-capture.md#sessions). Each start and end is
 * published as a `session` event. The speech log gives entries their `sessionId`. One screen
 * reader means one current session: a client that ends or replaces another client's session is
 * not refused, but warned about (docs/decisions.md#sessions-warn-instead-of-locking).
 */
export class SessionService implements ManageSessions {
  constructor(private readonly deps: SessionServiceDeps) {}

  start({ name, run, client }: StartSessionOptions): StartedSession {
    const label = sessionLabel('name', name);
    const group = run === undefined || run === null ? null : sessionLabel('run', run);
    const owner = clientLabel(client);
    const { ended, started } = this.deps.log.startSession({
      name: label,
      run: group,
      client: owner,
      startedAt: this.deps.clock.now(),
    });
    if (ended) this.deps.events.publish({ type: 'session', session: ended });
    this.deps.events.publish({ type: 'session', session: started });
    const replaced = ended && ended.client !== owner ? ended : null;
    if (replaced) {
      this.deps.logger.warn(`${describe(started)} replaced ${describe(replaced)}`);
    }
    return { session: started, replaced };
  }

  end(client?: string | null): void {
    const owner = clientLabel(client);
    const ended = this.deps.log.endSession(this.deps.clock.now());
    if (!ended) return;
    this.deps.events.publish({ type: 'session', session: ended });
    if (ended.client !== owner) {
      this.deps.logger.warn(`client ${owner ?? 'unknown'} ended ${describe(ended)}`);
    }
  }

  list(): SessionList {
    return {
      sessions: this.deps.log.sessions(),
      currentId: this.deps.log.currentSession()?.id ?? null,
    };
  }
}

function clientLabel(client: string | null | undefined): string | null {
  return client === undefined || client === null ? null : sessionLabel('client', client);
}
