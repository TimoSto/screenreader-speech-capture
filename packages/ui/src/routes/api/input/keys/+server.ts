import { error } from '@sveltejs/kit';
import { checkDto, KeysRequestSchema } from '@screenreader-speech-capture/shared';
import type { RequestHandler } from './$types';

/** Presses keys (`{ keys }`) on the bridge's machine. Only `keys` goes on: no `capture`. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body: unknown = await request.json().catch(() => undefined);
  const checked = checkDto(KeysRequestSchema, body);
  if (!checked.ok) error(400, `Invalid keys at ${checked.field}: ${checked.message}`);
  await locals.bridge.pressKeys(checked.value.keys);
  return new Response(null, { status: 204 });
};
