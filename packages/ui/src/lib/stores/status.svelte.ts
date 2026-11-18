import { formatAge, STATUS_POLL_MS, type StatusApi, type Ticker } from '#lib/core/status.js';
import type { StatusDto } from '@screenreader-speech-capture/shared';

/** The bridge status, kept fresh by a poll that pauses while the tab is hidden. */
export function createStatusStore(api: StatusApi, ticker: Ticker) {
  let status = $state<StatusDto | null>(null);
  let lastOkAt = $state<number | null>(null);
  let now = $state(0);
  let reachable = $state(true);
  let loading = $state(false);
  let inFlight: Promise<void> | null = null;

  function poll(): Promise<void> {
    if (inFlight) return inFlight;
    loading = true;
    inFlight = api
      .fetch()
      .then((next) => {
        status = next;
        lastOkAt = ticker.now();
        reachable = true;
      })
      .catch(() => {
        reachable = false; // the last known status stays, greyed out
      })
      .finally(() => {
        now = ticker.now();
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
    /** Starts polling; `seed` is the status the server rendered, so there is no flash. Returns the way to stop. */
    init(seed: StatusDto | null): () => void {
      now = ticker.now();
      if (seed && status === null) {
        status = seed;
        lastOkAt = now;
      }
      void poll();
      const stops = [
        ticker.every(STATUS_POLL_MS, () => {
          if (ticker.isVisible()) void poll();
        }),
        ticker.every(1000, () => {
          now = ticker.now();
        }),
        ticker.onVisible(() => void poll()),
      ];
      return () => stops.forEach((stop) => stop());
    },
    /** The retry button. */
    retry(): Promise<void> {
      return poll();
    },
    get age() {
      return reachable ? formatAge(now, lastOkAt) : 'bridge unreachable';
    },
  };
}
