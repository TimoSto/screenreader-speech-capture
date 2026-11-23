import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/** The header's status read: the browser asks the BFF, the BFF asks the bridge. */
export const GET: RequestHandler = async ({ locals }) => {
  return json(await locals.bridge.status());
};
