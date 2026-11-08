/** One recorded speech entry or marker (docs/http-api.md#data-model). */
export interface SpeechEntry {
  /**
   * Increasing sequence number, the entry's ID: survives a clear, restarts at 1 with the bridge.
   * The client's cursor and every `since` are seq values (docs/client.md#the-cursor).
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
}

export const isSpeech = (entry: SpeechEntry): boolean => entry.kind === 'speech';

export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface ServiceStatus {
  state: 'stopped' | 'starting' | 'running' | 'crashed' | 'failed';
  version: string;
  port: number;
  restarts: number;
}

/** Bridge health, as `GET /api/v1/status` reports it (docs/http-api.md). */
export interface BridgeStatus {
  bridge: { version: string; apiVersion: string; state: BridgeState };
  tcp: {
    listening: boolean;
    host: string;
    port: number;
    encoding: string;
    connections: { id: number; voice: string | null; connectedAt: string }[];
  };
  buffer: { size: number; maxEntries: number; firstSeq: number | null; lastSeq: number | null };
  playwright?: ServiceStatus;
  mcp?: ServiceStatus;
  input: { enabled: boolean };
}
