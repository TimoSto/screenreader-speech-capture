import { json } from '@sveltejs/kit';
import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

/** The header's poll: the browser asks the BFF, the BFF asks the bridge. */
export const GET: RequestHandler = async ({ fetch }) => {
  const status = await bridgeApiFromEnv(fetch).status();
  return json(status, { headers: { 'cache-control': 'no-store' } });
};
