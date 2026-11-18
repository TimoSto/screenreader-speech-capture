import type { StatusApi } from '#lib/core/status.js';
import type { StatusDto } from '@screenreader-speech-capture/shared';

/** The bridge status: read once on init and again on `retry()`. There is no polling. */
export function createStatusStore(api: StatusApi) {
  let status = $state<StatusDto | null>(null);
  let reachable = $state(true);
  let loading = $state(false);
  let inFlight: Promise<void> | null = null;

  function read(): Promise<void> {
    if (inFlight) return inFlight;
    loading = true;
    inFlight = api
      .fetch()
      .then((next) => {
        status = next;
        reachable = true;
      })
      .catch(() => {
        reachable = false; // the last known status stays, greyed out
      })
      .finally(() => {
        loading = false;
        inFlight = null;
      });
    return inFlight;
  }

  return {
    get status() {
      return status;
    },
    get reachable() {
      return reachable;
    },
    get loading() {
      return loading;
    },
    /** Reads the status once; `seed` is the status the server rendered, so there is no flash. */
    init(seed: StatusDto | null): void {
      if (seed && status === null) status = seed;
      void read();
    },
    /** The refresh button. */
    retry(): Promise<void> {
      return read();
    },
  };
}
