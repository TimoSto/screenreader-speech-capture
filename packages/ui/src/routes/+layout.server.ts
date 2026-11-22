import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ fetch, locals }) => {
  try {
    return { status: await bridgeApiFromEnv(fetch).status(), local: locals.local };
  } catch {
    // The header stays and shows "bridge unreachable"; the refresh button retries.
    return { status: null, local: locals.local };
  }
};
