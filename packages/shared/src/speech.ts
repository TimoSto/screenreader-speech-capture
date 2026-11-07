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
}

/** `GET /api/v1/speech` */
export interface SpeechListDto {
  entries: SpeechEntryDto[];
  /** `true` when entries after `since` were dropped because the buffer was full. */
  truncated: boolean;
}

/** `POST /api/v1/markers` */
export interface MarkerRequestDto {
  label: string;
}
