/** One recorded speech entry or marker (docs/usage/http-api.md#data-model). */
export interface SpeechEntry {
  /**
   * Increasing sequence number, the entry's ID: survives a clear and keeps rising across bridge
   * restarts.
   * The client's cursor and every `since` are seq values (docs/usage/client.md#the-cursor).
   */
  seq: number;
  kind: 'speech' | 'marker';
  /** What was spoken, or the marker's label. */
  text: string;
  /** ISO 8601, UTC, on the bridge's clock. */
  receivedAt: string;
  source: 'tcp' | 'api';
  /** Header (`voice=<id>`) of the sending voice, `null` if not set or for markers. */
  voice: string | null;
  /** TCP connection that delivered it, `null` for markers. */
  connectionId: number | null;
  /** The session that was current when it was recorded, `null` outside any session. */
  sessionId: number | null;
}

export const isSpeech = (entry: SpeechEntry): boolean => entry.kind === 'speech';
