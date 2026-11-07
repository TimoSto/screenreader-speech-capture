import type { BufferStats } from '../out/speech-repository.js';

export type BridgeState = 'starting' | 'ready' | 'stopping';

export interface ConnectionInfo {
  id: number;
  voice: string | null;
  connectedAt: Date;
}

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
  input: { enabled: boolean };
}

export interface GetStatus {
  status(): Status;
}
