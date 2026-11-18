import { json } from '@sveltejs/kit';
import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

/** The header's status read: the browser asks the BFF, the BFF asks the bridge. */
export const GET: RequestHandler = async ({ fetch }) => {
  return json(await bridgeApiFromEnv(fetch).status());
};
