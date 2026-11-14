import * as v from 'valibot';
import { API_LIMITS } from './limits.js';

const integer = (min: number) => v.pipe(v.number(), v.integer(), v.minValue(min));
const timestamp = v.pipe(v.string(), v.isoTimestamp());
const label = (text: string) =>
  v.pipe(
    v.string(),
    v.maxLength(API_LIMITS.sessionLabelLength),
    v.description(
      `${text} Trimmed, must not be empty, at most ${API_LIMITS.sessionLabelLength} characters.`,
    ),
  );

const sessionEntries = {
  id: v.pipe(integer(1), v.description('Increasing, restarts at 1 with the bridge.')),
  name: v.string(),
  run: v.pipe(v.nullable(v.string()), v.description('Optional label that groups sessions.')),
  client: v.pipe(
    v.nullable(v.string()),
    v.description(
      "Who started it: the `X-SR-Speech-Client` header, `null` if it wasn't sent. Added in API 1.10.",
    ),
  ),
  startedAt: timestamp,
  endedAt: v.pipe(v.nullable(timestamp), v.description('`null` while the session is current.')),
  startSeq: v.pipe(
    integer(0),
    v.description(
      'The last `seq` given out before the session started: `since=startSeq` reads the session ' +
        'from its start. Added in API 1.9.',
    ),
  ),
  firstSeq: v.pipe(
    v.nullable(integer(1)),
    v.description('First entry still in the buffer, `null` if none.'),
  ),
  lastSeq: v.pipe(
    v.nullable(integer(1)),
    v.description('Last entry still in the buffer, `null` if none.'),
  ),
  entries: v.pipe(integer(0), v.description('Entries of this session still in the buffer.')),
};

export const SessionSchema = v.pipe(
  v.object(sessionEntries),
  v.description('A session (docs/usage/speech-capture.md#sessions). Added in API 1.3.'),
  v.examples([
    {
      id: 7,
      name: 'form › submit button is announced',
      run: 'nightly-42',
      client: 'ci-runner pid 4242',
      startedAt: '2026-11-12T09:31:04.120Z',
      endedAt: null,
      startSeq: 339,
      firstSeq: 340,
      lastSeq: 342,
      entries: 3,
    },
  ]),
);

/** A session: the speech of one test or agent task (docs/usage/speech-capture.md#sessions). */
export type SessionDto = v.InferOutput<typeof SessionSchema>;

export const StartSessionRequestSchema = v.object({
  name: v.pipe(label('For example the test title.'), v.examples(['checkout test'])),
  run: v.pipe(
    v.optional(
      v.nullable(label('Optional label that groups sessions, for example one per test run.')),
    ),
    v.examples(['nightly-42']),
  ),
});

/** `POST /api/v1/sessions` */
export type StartSessionRequestDto = v.InferOutput<typeof StartSessionRequestSchema>;

export const StartSessionResponseSchema = v.pipe(
  v.object({
    ...sessionEntries,
    replaced: v.pipe(
      v.nullable(SessionSchema),
      v.description(
        'The session this start ended if another client had started it, `null` otherwise. ' +
          'Added in API 1.10.',
      ),
    ),
  }),
  v.description('`POST /sessions`: the new session, plus `replaced`.'),
);

/** `POST /api/v1/sessions` answer: the new session, plus the session it ended (`replaced`). */
export type StartSessionResponseDto = v.InferOutput<typeof StartSessionResponseSchema>;

/**
 * Request header naming the client (for example `host pid 1234`), so the bridge can tell when
 * one client ends or replaces another one's session. Optional. API 1.10.
 */
export const CLIENT_HEADER = 'x-sr-speech-client';

export const SessionListSchema = v.pipe(
  v.object({
    sessions: v.array(SessionSchema),
    currentId: v.nullable(integer(1)),
  }),
  v.description(
    '`GET /sessions`: the current session and the ended ones with entries in the buffer, newest first.',
  ),
);

/** `GET /api/v1/sessions` */
export type SessionListDto = v.InferOutput<typeof SessionListSchema>;
