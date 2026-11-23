import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  try {
    return { status: await locals.bridge.status(), local: locals.local };
  } catch {
    // The header stays and shows "bridge unreachable"; the refresh button retries.
    return { status: null, local: locals.local };
  }
};
