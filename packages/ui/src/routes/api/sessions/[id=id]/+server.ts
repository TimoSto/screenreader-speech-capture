import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

/**
 * Deletes an ended session and its speech (the bridge refuses the current one). The `id` matcher
 * only lets session ids through; anything else is a 404.
 */
export const DELETE: RequestHandler = async ({ params, fetch }) => {
  await bridgeApiFromEnv(fetch).deleteSession(params.id);
  return new Response(null, { status: 204 });
};
