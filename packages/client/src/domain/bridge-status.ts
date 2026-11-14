import type { Session } from './session.js';

export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface ServiceStatus {
  state: 'stopped' | 'starting' | 'running' | 'crashed' | 'failed';
  version: string;
  port: number;
  /** Restarts after crashes since the service was last started (bridge start or config change). */
  restarts: number;
  /** Exit code of the last unexpected exit, `null` if none, or killed by a signal. */
  exitCode: number | null;
}

/** Bridge health, as `GET /api/v1/status` reports it (docs/http-api.md). */
export interface BridgeStatus {
  bridge: {
    version: string;
    apiVersion: string;
    state: BridgeState;
    /** ISO 8601, UTC. When this bridge run started. */
    startedAt: string;
  };
  tcp: {
    listening: boolean;
    host: string;
    port: number;
    encoding: string;
    connections: { id: number; voice: string | null; connectedAt: string }[];
  };
  buffer: { size: number; maxEntries: number; firstSeq: number | null; lastSeq: number | null };
  playwright: ServiceStatus;
  mcp: ServiceStatus;
  /** The current session and the number of listed sessions. */
  session: { current: Session | null; count: number };
}
