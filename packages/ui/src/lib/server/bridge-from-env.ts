import { SR_BRIDGE_API_URL } from '$app/env/private';
import { createBridgeApi, type BridgeApi } from './bridge-api.js';

/** The bridge API of this deployment, at `SR_BRIDGE_API_URL` (`src/env.ts`). */
export function bridgeApiFromEnv(fetchFn: typeof fetch): BridgeApi {
  return createBridgeApi(SR_BRIDGE_API_URL, fetchFn);
}
