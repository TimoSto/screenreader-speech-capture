import * as v from 'valibot';
import { API_LIMITS } from './limits.js';

const integer = (min: number) => v.pipe(v.number(), v.integer(), v.minValue(min));
const timestamp = v.pipe(v.string(), v.isoTimestamp());

export const SpeechEntrySchema = v.pipe(
  v.object({
    seq: v.pipe(
      integer(1),
      v.description(
        'Increasing sequence number. Survives clear and keeps rising across restarts: the first ' +
          "entry of a bridge run gets the run's start time in milliseconds.",
      ),
    ),
    kind: v.picklist(['speech', 'marker']),
    text: v.string(),
    receivedAt: v.pipe(timestamp, v.description('When the bridge received the line (UTC).')),
    source: v.pipe(
      v.picklist(['tcp', 'api']),
      v.description('`tcp` for speech, `api` for markers.'),
    ),
    voice: v.pipe(
      v.nullable(v.string()),
      v.description(
        'Header (`voice=<id>`) of the sending voice, `null` if not set or for markers.',
      ),
    ),
    connectionId: v.pipe(
      v.nullable(integer(1)),
      v.description('TCP connection that delivered it, `null` for markers.'),
    ),
    sessionId: v.pipe(
      v.optional(v.nullable(integer(1))),
      v.description('The session that was current, `null` outside any session. Added in API 1.3.'),
    ),
  }),
  v.description('One recorded speech line or a marker.'),
  v.examples([
    {
      seq: 42,
      kind: 'speech',
      text: 'Submit, button',
      receivedAt: '2026-11-07T14:03:12.345Z',
      source: 'tcp',
      voice: 'ssc5000',
      connectionId: 3,
      sessionId: 7,
    },
  ]),
);

/** One recorded speech entry or marker, as returned by the API. */
export type SpeechEntryDto = v.InferOutput<typeof SpeechEntrySchema>;

export const SpeechListSchema = v.pipe(
  v.object({
    entries: v.array(SpeechEntrySchema),
    truncated: v.pipe(
      v.boolean(),
      v.description('`true` when entries after `since` were dropped because the buffer was full.'),
    ),
    hasMore: v.pipe(
      v.boolean(),
      v.description(
        "`true` when more entries follow: ask again with the last entry's `seq` as `since`.",
      ),
    ),
  }),
  v.description('`GET /speech`: a page of entries after `since`, oldest first.'),
);

/** `GET /api/v1/speech` */
export type SpeechListDto = v.InferOutput<typeof SpeechListSchema>;

export const WaitResultSchema = v.pipe(
  v.variant('matched', [
    v.object({ matched: v.literal(true), entry: SpeechEntrySchema }),
    v.object({
      matched: v.literal(false),
      entries: v.pipe(
        v.array(SpeechEntrySchema),
        v.maxLength(API_LIMITS.wait.seen),
        v.description(
          `The last ${API_LIMITS.wait.seen} entries seen after \`since\`, oldest first.`,
        ),
      ),
      omitted: v.pipe(
        integer(0),
        v.description('How many entries seen before those were left out. Added in API 1.11.'),
      ),
    }),
  ]),
  v.description('The answer of `GET /speech/wait`. `matched` tells a match from a timeout.'),
);

/**
 * `GET /api/v1/speech/wait`, always `200`: the first matching entry, or, when none matched in
 * time, the last entries seen after `since` and how many earlier ones were left out.
 */
export type WaitResultDto = v.InferOutput<typeof WaitResultSchema>;

export const MarkerRequestSchema = v.object({
  label: v.pipe(
    v.string(),
    v.maxLength(API_LIMITS.markerLength),
    v.description(
      `Marker text. Trimmed, must not be empty, at most ${API_LIMITS.markerLength} characters.`,
    ),
    v.examples(['step 3']),
  ),
});

/** `POST /api/v1/markers` */
export type MarkerRequestDto = v.InferOutput<typeof MarkerRequestSchema>;
