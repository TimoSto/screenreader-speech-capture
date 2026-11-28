import type { ConfigPatchDto } from '@screenreader-speech-capture/shared';
import { pendingFields, type ConfigApi, type ConfigState } from '#lib/core/config.js';

/**
 * The bridge's configuration: seeded by the page's load, read again on `refresh` and after every
 * save. A saved setting takes effect on the next start of the bridge, so `pending` lists the ones
 * that differ from what runs.
 */
export function createConfigStore(api: ConfigApi) {
  let state = $state<ConfigState | null>(null);
  let reachable = $state(true);
  let inFlight: Promise<void> | null = null;

  function read(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = api
      .fetch()
      .then((next) => {
        state = next;
        reachable = true;
      })
      .catch(() => {
        reachable = false; // the last known configuration stays
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    /** Whether a configuration has been read yet. */
    get loaded() {
      return state !== null;
    },
    get reachable() {
      return reachable;
    },
    get active() {
      return state?.active ?? null;
    },
    get saved() {
      return state?.saved ?? null;
    },
    /** Settings a flag or variable sets, by dotted path, with what sets them. */
    get overrides(): Readonly<Record<string, string>> {
      return state?.overrides ?? {};
    },
    /** Dotted paths of the saved settings that wait for a restart. */
    get pending(): string[] {
      return state === null ? [] : pendingFields(state.active, state.saved);
    },
    /**
     * Shows the configuration the page's load read, before any request of its own. Call it while
     * the page renders, on the server too: the stores are per request, so the server's HTML and the
     * first browser render agree. Unlike a list that is polled, every load's answer replaces what
     * is shown; `null` (the load failed) changes nothing.
     */
    seed(next: ConfigState | null): void {
      if (next === null) return;
      state = next;
      reachable = true;
    },
    /** Reads the configuration now (also after a failed read, to try again). */
    refresh(): Promise<void> {
      return read();
    },
    /** Saves a partial config for the next start. Rejects with the bridge's message. */
    async save(patch: ConfigPatchDto): Promise<void> {
      await api.update(patch);
      // A read that started before the save would show the old values: wait for it, read again.
      await inFlight;
      await read();
    },
  };
}
