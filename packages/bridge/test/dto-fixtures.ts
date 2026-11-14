// Domain objects for the HTTP DTO tests (src/adapters/in/http/dto/*.test.ts).
import type { Status } from '../src/application/ports/in/get-status.js';
import type { ServiceStatus } from '../src/domain/child-service.js';
import type { SessionSummary } from '../src/domain/session.js';
import type { SpeechEntry } from '../src/domain/speech-entry.js';

export const AT = new Date('2026-11-12T09:00:00.000Z');
export const AT_ISO = '2026-11-12T09:00:00.000Z';

export const entry: SpeechEntry = {
  seq: 4,
  kind: 'speech',
  text: 'OK button',
  receivedAt: AT,
  source: 'tcp',
  voice: 'eloquence',
  connectionId: 2,
  sessionId: 1,
};

export const session = (endedAt: Date | null = null): SessionSummary => ({
  id: 1,
  name: 'checkout',
  run: 'nightly',
  client: null,
  startedAt: AT,
  endedAt,
  startSeq: 2,
  firstSeq: 3,
  lastSeq: 4,
  entries: 2,
});

export const service = (state: ServiceStatus['state']): ServiceStatus => ({
  state,
  version: '1.0.0',
  port: 3000,
  restarts: 1,
  exitCode: 2,
});

export const status = (current: Status['session']['current']): Status => ({
  bridge: {
    version: '0.1.0',
    apiVersion: '1.4',
    state: 'ready',
    startedAt: AT,
  },
  tcp: {
    listening: true,
    host: '127.0.0.1',
    port: 4449,
    encoding: 'windows-1252',
    connections: [{ id: 1, voice: 'eloquence', connectedAt: AT }],
  },
  buffer: { size: 2, maxEntries: 10, firstSeq: 3, lastSeq: 4 },
  playwright: service('running'),
  mcp: service('crashed'),
  session: { current, count: 1 },
});
