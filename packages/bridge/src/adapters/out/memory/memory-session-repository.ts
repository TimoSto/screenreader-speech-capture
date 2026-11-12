import type { SessionRepository } from '../../../application/ports/out/session-repository.js';
import type { NewSession, Session } from '../../../domain/session.js';

/** Sessions in memory, oldest first (docs/speech-capture.md#sessions). */
export class MemorySessionRepository implements SessionRepository {
  private sessions: Session[] = [];
  private nextId = 1;
  private currentId: number | null = null;

  create(session: NewSession): Session {
    const stored: Session = { ...session, id: this.nextId++, endedAt: null };
    this.sessions.push(stored);
    this.currentId = stored.id;
    return stored;
  }

  endCurrent(endedAt: Date): Session | null {
    const current = this.current();
    if (!current) return null;
    const ended: Session = { ...current, endedAt };
    this.sessions = this.sessions.map((session) => (session.id === ended.id ? ended : session));
    this.currentId = null;
    return ended;
  }

  current(): Session | null {
    return this.currentId === null ? null : (this.get(this.currentId) ?? null);
  }

  get(id: number): Session | undefined {
    return this.sessions.find((session) => session.id === id);
  }

  lastId(): number {
    return this.nextId - 1;
  }

  list(): Session[] {
    return [...this.sessions].reverse();
  }

  removeEnded(keep: (session: Session) => boolean): Session[] {
    const removed: Session[] = [];
    this.sessions = this.sessions.filter((session) => {
      if (session.endedAt === null || keep(session)) return true;
      removed.push(session);
      return false;
    });
    return removed;
  }
}
