import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  try {
    // Where the HTTP API listens: the instructions for the test machine fill it in.
    const { http } = await locals.bridge.config('active');
    return { http };
  } catch {
    // The instructions show the defaults.
    return { http: null };
  }
};
