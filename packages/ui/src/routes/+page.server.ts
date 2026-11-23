import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  try {
    // `now` is the end of a live session's duration: the server and the first client render agree.
    return { sessions: await locals.bridge.sessions(), now: Date.now() };
  } catch {
    // The pane starts empty and fills in once the store reaches the bridge.
    return { sessions: null, now: Date.now() };
  }
};
