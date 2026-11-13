import type { SessionDto } from './session.js';

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
  /** Restarts after crashes since the service was last started (bridge start or config change). */
  restarts: number;
  /** Exit code of the last unexpected exit, `null` if there was none. Added in API 1.1. */
  exitCode: number | null;
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
  /** Added in API 1.1. */
  playwright: ServiceStatusDto;
  /** Added in API 1.2. */
  mcp: ServiceStatusDto;
  input: { enabled: boolean };
  /** The current session and the number of listed sessions. Added in API 1.3. */
  session: { current: SessionDto | null; count: number };
}
