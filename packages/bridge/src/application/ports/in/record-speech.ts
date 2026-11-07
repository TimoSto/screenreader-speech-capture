/** One complete, decoded, non-empty line from a capture source. */
export interface CapturedSpeech {
  text: string;
  /** From the connection's `voice=<id>` header, `null` if it had none. */
  voice: string | null;
  connectionId: number;
}

/** Driven by a capture adapter (the TCP listener for the socket voice). */
export interface RecordSpeech {
  record(speech: CapturedSpeech): void;
}
