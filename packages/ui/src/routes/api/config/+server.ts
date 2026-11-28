import { error, json } from '@sveltejs/kit';
import { checkDto, ConfigPatchSchema } from '@screenreader-speech-capture/shared';
import { readConfigState } from '#lib/server/config-state.js';
import type { RequestHandler } from './$types';

/** The settings page's re-read in the browser (`readConfigState`). */
export const GET: RequestHandler = async ({ locals: { bridge } }) =>
  json(await readConfigState(bridge));

/** Saves a partial config for the next start and answers with the saved config. */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const body: unknown = await request.json().catch(() => undefined);
  const checked = checkDto(ConfigPatchSchema, body);
  if (!checked.ok) {
    error(400, {
      message: `Invalid setting at ${checked.field}: ${checked.message}`,
      field: checked.field,
    });
  }
  return json(await locals.bridge.updateConfig(checked.value));
};
