import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch }) => {
  try {
    return { status: await bridgeApiFromEnv(fetch).status() };
  } catch {
    // The header stays and shows "bridge unreachable"; the status store keeps polling.
    return { status: null };
  }
};
