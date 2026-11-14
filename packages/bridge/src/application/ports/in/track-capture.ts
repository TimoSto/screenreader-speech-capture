/**
 * Driven by a capture adapter (the TCP listener): what happens to its listener and connections,
 * for the status. Connection ids are the adapter's; they match `CapturedSpeech.connectionId`.
 */
export interface TrackCapture {
  listening(listener: { host: string; port: number; encoding: string }): void;
  stoppedListening(): void;
  connectionOpened(id: number): void;
  /** The connection's `voice=<id>` header arrived. */
  voiceIdentified(id: number, voice: string): void;
  connectionClosed(id: number): void;
}
