/** One recorded speech entry or marker, as returned by the API. */
export interface SpeechEntryDto {
  /** Increasing sequence number: survives clear, restarts at 1 with the bridge. */
  seq: number;
  kind: 'speech' | 'marker';
  text: string;
  /** ISO 8601, UTC. When the bridge received the line. */
  receivedAt: string;
  source: 'tcp' | 'api';
  /** Header (`voice=<id>`) of the sending voice, `null` if not set or for markers. */
  voice: string | null;
  /** TCP connection that delivered it, `null` for markers. */
  connectionId: number | null;
  /** The session that was current, `null` outside any session. Added in API 1.3. */
  sessionId?: number | null;
}

/** `GET /api/v1/speech` */
export interface SpeechListDto {
  entries: SpeechEntryDto[];
  /** `true` when entries after `since` were dropped because the buffer was full. */
  truncated: boolean;
  /** `true` when there are more entries: ask again with the last entry's `seq` as `since`. */
  hasMore: boolean;
}

/**
 * `GET /api/v1/speech/wait`, always `200`: the first matching entry, or, when none matched in
 * time, the last 1000 entries seen after `since` (oldest first) and how many earlier ones were
 * left out (`omitted`, since API 1.11).
 */
export type WaitResultDto =
  | { matched: true; entry: SpeechEntryDto }
  | { matched: false; entries: SpeechEntryDto[]; omitted: number };

/** `POST /api/v1/markers` */
export interface MarkerRequestDto {
  label: string;
}
