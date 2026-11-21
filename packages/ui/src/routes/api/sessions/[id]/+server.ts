import { error } from '@sveltejs/kit';
import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

/** Deletes an ended session and its speech (the bridge refuses the current one). */
export const DELETE: RequestHandler = async ({ params, fetch }) => {
  const id = Number(params.id);
  if (!/^\d+$/.test(params.id) || !Number.isSafeInteger(id) || id < 1) {
    error(400, 'The session id must be a positive integer');
  }
  await bridgeApiFromEnv(fetch).deleteSession(id);
  return new Response(null, { status: 204 });
};
