import type { ConnectionInfo } from '../../../domain/capture.js';
import type { ServiceStatus } from '../../../domain/service.js';
import type { BufferStats } from '../../../domain/speech-buffer.js';

export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface Status {
  bridge: { version: string; apiVersion: string; state: BridgeState };
  tcp: {
    listening: boolean;
    host: string;
    port: number;
    encoding: string;
    connections: ConnectionInfo[];
  };
  buffer: BufferStats;
  playwright: ServiceStatus;
  input: { enabled: boolean };
}

export interface GetStatus {
  status(): Status;
}
