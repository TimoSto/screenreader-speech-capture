import { createBridgeApi, DEFAULT_BRIDGE_URL } from '#lib/server/bridge-api.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch }) => {
  // The bridge sets SR_BRIDGE_API_URL to its own address when it mounts the UI (read per request,
  // so no SvelteKit env module is needed).
  const api = createBridgeApi(process.env.SR_BRIDGE_API_URL ?? DEFAULT_BRIDGE_URL, fetch);
  return { status: await api.status() };
};
