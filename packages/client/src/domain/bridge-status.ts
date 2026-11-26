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

/** Whether a native input feature works on the bridge's machine. Fixed at the bridge start. */
export interface InputAvailability {
  available: boolean;
  /** The library that does it, `null` when not available. */
  backend: string | null;
  /** Why it is not available, `null` when it is. */
  reason: string | null;
}

/** Bridge health, as `GET /api/v1/status` reports it (docs/usage/http-api.md). */
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
  /** `native`: `press` / `click`; `focus`: `focus` without options. */
  input: { native: InputAvailability; focus: InputAvailability };
}
