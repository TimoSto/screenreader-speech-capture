import type { SessionsApi } from '#lib/core/sessions.js';
import type { SessionDto, SessionListDto } from '@screenreader-speech-capture/shared';

/** How often the list is read again, so entry counts and sessions of other clients show up. */
const REFRESH_MS = 3000;

/** The sessions: read on `init`, then every few seconds, and after every start or end. */
export function createSessionsStore(api: SessionsApi) {
  let sessions = $state<SessionDto[]>([]);
  let currentId = $state<number | null>(null);
  let reachable = $state(true);
  let now = $state(Date.now());
  let inFlight: Promise<void> | null = null;

  function apply(list: SessionListDto): void {
    sessions = list.sessions;
    currentId = list.currentId;
    now = Date.now();
  }

  function read(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = api
      .list()
      .then((list) => {
        apply(list);
        reachable = true;
      })
      .catch(() => {
        reachable = false; // the last known list stays
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  /** A read that started before the change would show the old list, so wait for it and read again. */
  async function refreshAfterChange(): Promise<void> {
    await inFlight;
    await read();
  }

  return {
    get sessions() {
      return sessions;
    },
    get currentId() {
      return currentId;
    },
    get reachable() {
      return reachable;
    },
    /** Epoch ms, ticking once a second while a session is live (for its duration). */
    get now() {
      return now;
    },
    /**
     * Reads the list and keeps it fresh; `seed` is the list the server rendered, so there is no
     * flash. Returns the function that stops the timers (call it when the page goes away).
     */
    init(seed: SessionListDto | null): () => void {
      if (seed && sessions.length === 0) apply(seed);
      void read();
      const tick = setInterval(() => {
        if (currentId !== null) now = Date.now();
      }, 1000);
      const refresh = setInterval(() => void read(), REFRESH_MS);
      return () => {
        clearInterval(tick);
        clearInterval(refresh);
      };
    },
    /** Starts a session, which ends the previous one. Rejects with the bridge's message. */
    async start(name: string, run: string | null): Promise<SessionDto> {
      const started = await api.start(name, run);
      await refreshAfterChange();
      return started;
    },
    async end(): Promise<void> {
      await api.end();
      await refreshAfterChange();
    },
  };
}
