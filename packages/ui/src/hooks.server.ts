import type { Handle } from '@sveltejs/kit/hooks';
import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';

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
