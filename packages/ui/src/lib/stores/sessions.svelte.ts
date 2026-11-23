import type { SessionsApi } from '#lib/core/sessions.js';
import type { SessionDto, SessionListDto } from '@screenreader-speech-capture/shared';

/** How often the list is read again, so entry counts and sessions of other clients show up. */
const REFRESH_MS = 3000;

/** The sessions: seeded by the page, read on `init`, then every few seconds, and after every start, end or delete. */
export function createSessionsStore(api: SessionsApi) {
  let sessions = $state<SessionDto[]>([]);
  let currentId = $state<number | null>(null);
  let outsideEntries = $state(0);
  let reachable = $state(true);
  let loaded = $state(false);
  let now = $state(Date.now());
  let inFlight: Promise<void> | null = null;

  function apply(list: SessionListDto, at = Date.now()): void {
    sessions = list.sessions;
    currentId = list.currentId;
    outsideEntries = list.outsideEntries;
    now = at;
    loaded = true;
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
    /** Entries in the buffer recorded outside any session. */
    get outsideEntries() {
      return outsideEntries;
    },
    /** Whether a list has been applied yet (the seed or a read). */
    get loaded() {
      return loaded;
    },
    get reachable() {
      return reachable;
    },
    /** Epoch ms, ticking once a second while a session is live (for its duration). */
    get now() {
      return now;
    },
    /**
     * Shows the list the page's load read (`now`: when it was read), before any request of its
     * own. Call it while the page renders, on the server too: the stores are per request, so the
     * server's HTML and the first browser render agree. Does nothing once a list is shown.
     */
    seed(list: SessionListDto | null, at: number): void {
      if (list !== null && !loaded) apply(list, at);
    },
    /**
     * Reads the list and keeps it fresh. Call it in the browser only. Returns the function that
     * stops the timers (call it when the page goes away).
     */
    init(): () => void {
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
    /** Reads the list now, for a change made elsewhere (the speech of a scope was cleared). */
    refresh(): Promise<void> {
      return refreshAfterChange();
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
    /** Deletes an ended session. Rejects with the bridge's message. */
    async delete(id: number): Promise<void> {
      await api.delete(id);
      await refreshAfterChange();
    },
  };
}
