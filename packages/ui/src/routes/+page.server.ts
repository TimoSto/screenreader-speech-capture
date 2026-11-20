import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    // `now` is the end of a live session's duration: the server and the first client render agree.
    return { sessions: await bridgeApiFromEnv(fetch).sessions(), now: Date.now() };
  } catch {
    // The pane starts empty and fills in once the store reaches the bridge.
    return { sessions: null, now: Date.now() };
  }
};
