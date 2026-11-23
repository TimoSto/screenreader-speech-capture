import { error, json } from '@sveltejs/kit';
import { checkDto, StartSessionRequestSchema } from '@screenreader-speech-capture/shared';
import type { RequestHandler } from './$types';

/** The sessions pane's list: the browser asks the BFF, the BFF asks the bridge. */
export const GET: RequestHandler = async ({ locals }) => {
  return json(await locals.bridge.sessions());
};

/** Starts a session (`{ name, run? }`); the bridge ends the previous one. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body: unknown = await request.json().catch(() => undefined);
  const checked = checkDto(StartSessionRequestSchema, body);
  if (!checked.ok) error(400, `Invalid session at ${checked.field}: ${checked.message}`);
  return json(await locals.bridge.startSession(checked.value), { status: 201 });
};
