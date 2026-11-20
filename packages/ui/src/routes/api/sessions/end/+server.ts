import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

/** Ends the current session (nothing happens if none is current). */
export const POST: RequestHandler = async ({ fetch }) => {
  await bridgeApiFromEnv(fetch).endSession();
  return new Response(null, { status: 204 });
};
