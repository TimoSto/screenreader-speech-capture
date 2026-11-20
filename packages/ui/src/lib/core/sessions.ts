import type {
  SessionDto,
  SessionListDto,
  StartSessionResponseDto,
} from '@screenreader-speech-capture/shared';

/** Where the sessions come from and go to (the HTTP adapter asks the BFF, which asks the bridge). */
export interface SessionsApi {
  list(): Promise<SessionListDto>;
  start(name: string, run: string | null): Promise<StartSessionResponseDto>;
  /** Ends the current session; does nothing if none is current. */
  end(): Promise<void>;
}

/** `4 s`, `3 min 12 s`, `1 h 05 min`. Never negative (the bridge's clock may run ahead). */
export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

export type SessionMeta = {
  /** `#7` */
  id: string;
  run: string | null;
  duration: string;
  /** `4 entries`, `1 entry` */
  entries: string;
  /** The same facts as a sentence, for the screen reader. */
  spoken: string;
};

/** What a row shows under the name. `now` (epoch ms) is the end of a session that is still live. */
export function describeSession(session: SessionDto, now: number): SessionMeta {
  const end = session.endedAt === null ? now : Date.parse(session.endedAt);
  const duration = formatDuration(end - Date.parse(session.startedAt));
  const live = session.endedAt === null;
  const entries = `${session.entries} ${session.entries === 1 ? 'entry' : 'entries'}`;
  const parts = [
    `Session ${session.id}`,
    live ? 'live' : null,
    session.run === null ? null : `run ${session.run}`,
    duration,
    entries,
  ];
  return {
    id: `#${session.id}`,
    run: session.run,
    duration,
    entries,
    spoken: parts.filter((part) => part !== null).join(', '),
  };
}

/** What the log shows: a session by id, or `'none'` for the speech outside any session. */
export type SessionScope = number | 'none';

/** The URL value that selects the speech outside any session (the bridge's `session=none`). */
export const OUTSIDE_SESSIONS = 'none';

/**
 * The scope a pane shows: `none` if the URL asks for it, the session named in the URL if it still
 * exists, otherwise the current one (following), otherwise the speech outside any session.
 */
export function selectedScope(
  requested: string | null,
  sessions: SessionDto[],
  currentId: number | null,
): SessionScope {
  if (requested === OUTSIDE_SESSIONS) return OUTSIDE_SESSIONS;
  const id = requested === null || !/^\d+$/.test(requested) ? null : Number(requested);
  if (id !== null && sessions.some((session) => session.id === id)) return id;
  return currentId ?? OUTSIDE_SESSIONS;
}
