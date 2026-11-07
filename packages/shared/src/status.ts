export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface ConnectionDto {
  id: number;
  voice: string | null;
  connectedAt: string;
}

export interface ServiceStatusDto {
  state: 'stopped' | 'starting' | 'running' | 'crashed' | 'failed';
  version: string;
  port: number;
  restarts: number;
}

/** `GET /api/v1/status` */
export interface StatusDto {
  bridge: { version: string; apiVersion: string; state: BridgeState };
  tcp: {
    listening: boolean;
    host: string;
    port: number;
    encoding: string;
    connections: ConnectionDto[];
  };
  buffer: { size: number; maxEntries: number; firstSeq: number | null; lastSeq: number | null };
  /** Added in M3. */
  playwright?: ServiceStatusDto;
  /** Added in M3. */
  mcp?: ServiceStatusDto;
  input: { enabled: boolean };
}
