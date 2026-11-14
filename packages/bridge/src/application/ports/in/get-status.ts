import type { ConnectionInfo } from '../../../domain/capture.js';
import type { ServiceName, ServiceStatus } from '../../../domain/child-service.js';
import type { SessionSummary } from '../../../domain/session.js';
import type { BufferStats } from '../../../domain/speech-buffer.js';

export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface Status {
  bridge: {
    version: string;
    apiVersion: string;
    state: BridgeState;
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
  /** Each child service, by its name. The HTTP API reports them as top-level fields. */
  services: Readonly<Record<ServiceName, ServiceStatus>>;
  /** The current session, and how many sessions are listed (`GET /sessions`). */
  session: { current: SessionSummary | null; count: number };
}

export interface GetStatus {
  status(): Status;
}
