import { readConfigState } from '#lib/server/config-state.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  try {
    return { config: await readConfigState(locals.bridge) };
  } catch {
    // The page says so once the browser's own read fails too.
    return { config: null };
  }
};
