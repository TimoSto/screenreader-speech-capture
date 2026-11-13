import type { ConnectionInfo } from '../../../domain/capture.js';
import type { ServiceStatus } from '../../../domain/child-service.js';
import type { SessionSummary } from '../../../domain/session.js';
import type { BufferStats } from '../../../domain/speech-buffer.js';

export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface Status {
  bridge: {
    version: string;
    apiVersion: string;
    state: BridgeState;
    /** Random id of this bridge run: a new one means `seq` and session ids started over. */
    instanceId: string;
    startedAt: Date;
  };
  tcp: {
    listening: boolean;
    host: string;
    port: number;
    encoding: string;
    connections: ConnectionInfo[];
  };
  buffer: BufferStats;
  playwright: ServiceStatus;
  mcp: ServiceStatus;
  input: { enabled: boolean };
  /** The current session, and how many sessions are listed (`GET /sessions`). */
  session: { current: SessionSummary | null; count: number };
}

export interface GetStatus {
  status(): Status;
}
