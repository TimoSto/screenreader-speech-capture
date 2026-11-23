import type { RequestHandler } from './$types';

/** Ends the current session (nothing happens if none is current). */
export const POST: RequestHandler = async ({ locals }) => {
  await locals.bridge.endSession();
  return new Response(null, { status: 204 });
};
