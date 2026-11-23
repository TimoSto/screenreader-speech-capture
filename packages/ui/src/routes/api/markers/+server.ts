import { error, json } from '@sveltejs/kit';
import { checkDto, MarkerRequestSchema } from '@screenreader-speech-capture/shared';
import type { RequestHandler } from './$types';

/** Inserts a marker (`{ label }`) into the timeline. */
export const POST: RequestHandler = async ({ request, locals }) => {
  const body: unknown = await request.json().catch(() => undefined);
  const checked = checkDto(MarkerRequestSchema, body);
  if (!checked.ok) error(400, `Invalid marker at ${checked.field}: ${checked.message}`);
  return json(await locals.bridge.addMarker(checked.value.label), { status: 201 });
};
