import { describe, expect, it } from 'vitest';
import { AT_ISO, session, status } from '../../../../../test/dto-fixtures.js';
import { toSessionDto } from './session.js';
import { toStatusDto } from './status.js';

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
      session: { current: toSessionDto(session()), count: 1 },
    });
  });

  it('keeps a missing current session as null', () => {
    expect(toStatusDto(status(null)).session.current).toBeNull();
  });
});
