/** Driven by the TCP adapter: what the socket voice sends. */
export interface RecordSpeech {
  listenerStarted(info: { host: string; port: number; encoding: string }): void;
  listenerStopped(): void;
  /** Returns the id of the new connection. */
  connectionOpened(): number;
  /** The connection's first line was a `voice=<id>` header. */
  setVoice(connectionId: number, voice: string): void;
  /** One complete, decoded, non-empty line. */
  record(connectionId: number, text: string): void;
  connectionClosed(connectionId: number): void;
}
