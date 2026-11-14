/** One recorded speech line (`kind: "speech"`) or a marker set through the API. */
export interface SpeechEntry {
  /**
   * Increasing sequence number. Survives clear, and keeps rising across restarts: the first one
   * of a bridge run is its start time in ms.
   */
  readonly seq: number;
  readonly kind: 'speech' | 'marker';
  readonly text: string;
  readonly receivedAt: Date;
  readonly source: 'tcp' | 'api';
  readonly voice: string | null;
  readonly connectionId: number | null;
  /** The session that was current when it was recorded, `null` outside any session. */
  readonly sessionId: number | null;
}
