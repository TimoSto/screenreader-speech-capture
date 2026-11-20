import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    return { sessions: await bridgeApiFromEnv(fetch).sessions() };
  } catch {
    // The pane starts empty and fills in once the store reaches the bridge.
    return { sessions: null };
  }
};
