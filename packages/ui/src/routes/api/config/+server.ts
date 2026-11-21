import { error, json } from '@sveltejs/kit';
import { checkDto, ConfigPatchSchema } from '@screenreader-speech-capture/shared';
import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import type { RequestHandler } from './$types';

/**
 * The settings page's read in one answer: what runs (`active`), what the next start will use
 * (`saved`) and the settings a flag or variable sets (`overrides`, by dotted path).
 */
export const GET: RequestHandler = async ({ fetch }) => {
  const bridge = bridgeApiFromEnv(fetch);
  const [active, saved, overrides] = await Promise.all([
    bridge.config('active'),
    bridge.config('saved'),
    bridge.configOverrides(),
  ]);
  return json({ active, saved, overrides: overrides.overrides });
};

/** Saves a partial config for the next start and answers with the saved config. */
export const PUT: RequestHandler = async ({ request, fetch }) => {
  const body: unknown = await request.json().catch(() => undefined);
  const checked = checkDto(ConfigPatchSchema, body);
  if (!checked.ok) {
    error(400, {
      message: `Invalid setting at ${checked.field}: ${checked.message}`,
      field: checked.field,
    });
  }
  return json(await bridgeApiFromEnv(fetch).updateConfig(checked.value));
};
