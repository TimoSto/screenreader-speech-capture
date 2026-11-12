/** A session: the speech of one test or agent task (docs/speech-capture.md#sessions). Added in API 1.3. */
export interface SessionDto {
  /** Increasing, restarts at 1 with the bridge. */
  id: number;
  name: string;
  /** Optional label that groups sessions, `null` if not set. */
  run: string | null;
  /** ISO 8601, UTC. */
  startedAt: string;
  /** ISO 8601, UTC. `null` while the session is current. */
  endedAt: string | null;
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

/** `GET /api/v1/sessions`: the current session and the ones with entries in the buffer, newest first. */
export interface SessionListDto {
  sessions: SessionDto[];
  currentId: number | null;
}
