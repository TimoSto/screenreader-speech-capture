import { error, json } from '@sveltejs/kit';
import { API_LIMITS } from '@screenreader-speech-capture/shared';
import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

function intParam(value: string | null, fallback: number, max: number): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) {
    error(400, `Expected a whole number from 0 to ${max}, got "${value}"`);
  }
  return parsed;
}

/** One page of a scope's speech (`?session=<id|none>&since=<seq>&limit=<n>`), oldest first. */
export const GET: RequestHandler = async ({ url, fetch }) => {
  const session = url.searchParams.get('session');
  if (session !== null && session !== 'none' && !/^\d+$/.test(session)) {
    error(400, 'session must be an id or "none"');
  }
  const since = intParam(url.searchParams.get('since'), 0, Number.MAX_SAFE_INTEGER);
  const limit = intParam(
    url.searchParams.get('limit'),
    API_LIMITS.list.default,
    API_LIMITS.list.max,
  );
  return json(await bridgeApiFromEnv(fetch).speech(session, since, limit));
};
