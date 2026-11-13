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
  /**
   * `bridge.instanceId` of the bridge that answered. If it differs from the one `since` came
   * from, the bridge restarted and `since` refers to entries that are gone. Added in API 1.4.
   */
  instanceId: string;
}

/**
 * Data of the `bridge` event, the first event of every `GET /api/v1/speech/stream`, before any
 * replay. Added in API 1.4.
 */
export interface BridgeEventDto {
  instanceId: string;
}

/**
 * `GET /api/v1/speech/wait`, always `200`: the first matching entry, or, when none matched in
 * time, every entry seen after `since` (oldest first).
 */
export type WaitResultDto =
  { matched: true; entry: SpeechEntryDto } | { matched: false; entries: SpeechEntryDto[] };

/** `POST /api/v1/markers` */
export interface MarkerRequestDto {
  label: string;
}
