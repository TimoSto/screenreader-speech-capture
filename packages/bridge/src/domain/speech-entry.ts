/** One recorded speech line (`kind: "speech"`) or a marker set through the API. */
export interface SpeechEntry {
  readonly id: string;
  /** Increasing sequence number, never reused (survives clear). */
  readonly seq: number;
  readonly kind: 'speech' | 'marker';
  readonly text: string;
  readonly receivedAt: Date;
  readonly monotonicMs: number;
  readonly source: 'tcp' | 'api';
  readonly voice: string | null;
  readonly connectionId: number | null;
}

/** A speech entry before the repository has given it a `seq`. */
export type NewSpeechEntry = Omit<SpeechEntry, 'seq'>;
