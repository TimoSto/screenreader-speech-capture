import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { bridgeApiFromEnv } from '#lib/server/bridge-from-env.js';
import { serverLog } from '#lib/server/log.js';

/**
 * Set by the bridge (`LOCAL_HEADER` in `packages/bridge/src/composition/ui.ts`) on a request that
 * comes from the bridge's own machine, and removed from every other one. The UI can't import it:
 * the bridge and the UI don't depend on each other.
 */
const LOCAL_HEADER = 'x-sr-bridge-local';

export const handle: Handle = ({ event, resolve }) => {
  event.locals.local = event.request.headers.get(LOCAL_HEADER) === '1';
  // Built once per request and with its `fetch`, so routes and loads share one way to the bridge.
  event.locals.bridge = bridgeApiFromEnv(event.fetch);
  return resolve(event);
};

/**
 * An unexpected error (`kind: 'unknown'`: not one thrown with `error()`, not SvelteKit's own such
 * as a 404) is one line in the bridge log; the browser keeps SvelteKit's generic answer. The line
 * names the path but never the query, which can hold speech text that must stay off the console
 * (docs/usage/operations.md#speech-text-stays-off-the-console).
 */
export const handleError: HandleServerError = ({ kind, error, event }) => {
  if (kind !== 'unknown') return;
  const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  serverLog().error(`${event.request.method} ${event.url.pathname}: ${reason}`);
};
