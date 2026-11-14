/** A session: the speech of one test or agent task (docs/speech-capture.md#sessions). Added in API 1.3. */
export interface SessionDto {
  /** Increasing, restarts at 1 with the bridge. */
  id: number;
  name: string;
  /** Optional label that groups sessions, `null` if not set. */
  run: string | null;
  /** Who started it (the `X-SR-Speech-Client` header), `null` if not sent. API 1.10. */
  client: string | null;
  /** ISO 8601, UTC. */
  startedAt: string;
  /** ISO 8601, UTC. `null` while the session is current. */
  endedAt: string | null;
  /** The last `seq` before the session started: `since=startSeq` reads it from its start. API 1.9. */
  startSeq: number;
  /** First and last entry still in the buffer, `null` if none. */
  firstSeq: number | null;
  lastSeq: number | null;
  /** Entries of this session still in the buffer. */
  entries: number;
}

/** `POST /api/v1/sessions` */
export interface StartSessionRequestDto {
  name: string;
  run?: string | null;
}

/**
 * `POST /api/v1/sessions` answer: the new session, plus the session it ended if another client
 * had started that one (`null` otherwise). API 1.10.
 */
export interface StartSessionResponseDto extends SessionDto {
  replaced: SessionDto | null;
}

/**
 * Request header naming the client (for example `host pid 1234`), so the bridge can tell when
 * one client ends or replaces another one's session. Optional. API 1.10.
 */
export const CLIENT_HEADER = 'x-sr-speech-client';

/** `GET /api/v1/sessions`: the current session and the ones with entries in the buffer, newest first. */
export interface SessionListDto {
  sessions: SessionDto[];
  currentId: number | null;
}
