import { getSessions } from '#lib/remote/sessions.remote.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  try {
    // Awaited here, the query's answer goes into the page for the browser's `getSessions()` too.
    // `now` is the end of a live session's duration: the server and the first client render agree.
    return { sessions: await getSessions(), now: Date.now() };
  } catch {
    // The pane starts empty and fills in once the store reaches the bridge.
    return { sessions: null, now: Date.now() };
  }
};
