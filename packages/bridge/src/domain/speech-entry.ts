/** One recorded speech line (`kind: "speech"`) or a marker set through the API. */
export interface SpeechEntry {
  /** Increasing sequence number: survives clear, restarts at 1 with the bridge. */
  readonly seq: number;
  readonly kind: 'speech' | 'marker';
  readonly text: string;
  readonly receivedAt: Date;
  readonly source: 'tcp' | 'api';
  readonly voice: string | null;
  readonly connectionId: number | null;
}

/** A speech entry before the repository has given it a `seq`. */
export type NewSpeechEntry = Omit<SpeechEntry, 'seq'>;
