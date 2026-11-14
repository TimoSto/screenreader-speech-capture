import { describe, expect, it } from 'vitest';
import type { Status } from '../../../../application/ports/in/get-status.js';
import type { ServiceStatus } from '../../../../domain/child-service.js';
import { AT, AT_ISO, session } from '../../../../../test/dto-fixtures.js';
import { toSessionDto } from './session.js';
import { toStatusDto } from './status.js';

const service = (state: ServiceStatus['state']): ServiceStatus => ({
  state,
  version: '1.0.0',
  port: 3000,
  restarts: 1,
  exitCode: 2,
});

const status = (current: Status['session']['current']): Status => ({
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
  input: { enabled: false },
  session: { current, count: 1 },
});

describe('toStatusDto', () => {
  it('maps every section, with dates as ISO 8601', () => {
    expect(toStatusDto(status(session()))).toEqual({
      bridge: {
        version: '0.1.0',
        apiVersion: '1.4',
        state: 'ready',
        startedAt: AT_ISO,
      },
      tcp: {
        listening: true,
        host: '127.0.0.1',
        port: 4449,
        encoding: 'windows-1252',
        connections: [{ id: 1, voice: 'eloquence', connectedAt: AT_ISO }],
      },
      buffer: { size: 2, maxEntries: 10, firstSeq: 3, lastSeq: 4 },
      playwright: { state: 'running', version: '1.0.0', port: 3000, restarts: 1, exitCode: 2 },
      mcp: { state: 'crashed', version: '1.0.0', port: 3000, restarts: 1, exitCode: 2 },
      input: { enabled: false },
      session: { current: toSessionDto(session()), count: 1 },
    });
  });

  it('keeps a missing current session as null', () => {
    expect(toStatusDto(status(null)).session.current).toBeNull();
  });
});
