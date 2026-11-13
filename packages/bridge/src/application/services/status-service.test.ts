import { describe, expect, it } from 'vitest';
import { MemorySessionRepository } from '../../adapters/out/memory/memory-session-repository.js';
import { MemorySpeechRepository } from '../../adapters/out/memory/memory-speech-repository.js';
import { DEFAULT_CONFIG } from '../../domain/config/index.js';
import type { CaptureStatus } from '../../domain/capture.js';
import { StatusService } from './status-service.js';

const STARTED_AT = new Date('2026-11-07T13:00:00.000Z');

function setup(capture: CaptureStatus) {
  const repository = new MemorySpeechRepository(10);
  const sessions = new MemorySessionRepository();
  const status = new StatusService({
    capture: { captureStatus: () => capture },
    repository,
    sessions,
    playwright: {
      status: () => ({ state: 'running', version: '1.65.0', port: 3000, restarts: 1, exitCode: 1 }),
    },
    mcp: {
      status: () => ({ state: 'failed', version: '0.0.85', port: 8931, restarts: 4, exitCode: 2 }),
    },
    config: () => DEFAULT_CONFIG,
    version: '1.2.3',
    apiVersion: '1.0',
    instance: { id: 'run-1', startedAt: STARTED_AT },
  });
  return { status, repository, sessions };
}

describe('StatusService', () => {
  it('reports the listener, connections, buffer and versions', () => {
    const connectedAt = new Date('2026-11-07T14:00:00.000Z');
    const { status, repository } = setup({
      listener: { listening: true, host: '127.0.0.1', port: 5000, encoding: 'utf-8' },
      connections: [{ id: 2, voice: 'dev', connectedAt }],
    });
    repository.add({
      kind: 'marker',
      text: 'm',
      receivedAt: connectedAt,
      source: 'api',
      voice: null,
      connectionId: null,
      sessionId: null,
    });
    status.setState('ready');

    expect(status.status()).toEqual({
      bridge: {
        version: '1.2.3',
        apiVersion: '1.0',
        state: 'ready',
        instanceId: 'run-1',
        startedAt: STARTED_AT,
      },
      tcp: {
        listening: true,
        host: '127.0.0.1',
        port: 5000,
        encoding: 'utf-8',
        connections: [{ id: 2, voice: 'dev', connectedAt }],
      },
      buffer: { size: 1, maxEntries: 10, firstSeq: 1, lastSeq: 1 },
      playwright: { state: 'running', version: '1.65.0', port: 3000, restarts: 1, exitCode: 1 },
      mcp: { state: 'failed', version: '0.0.85', port: 8931, restarts: 4, exitCode: 2 },
      input: { enabled: true },
      session: { current: null, count: 0 },
    });
  });

  it('starts in "starting" and falls back to the configured listener', () => {
    const { status } = setup({ listener: null, connections: [] });
    expect(status.status().bridge.state).toBe('starting');
    expect(status.status().tcp).toEqual({
      listening: false,
      host: DEFAULT_CONFIG.tcp.host,
      port: DEFAULT_CONFIG.tcp.port,
      encoding: DEFAULT_CONFIG.tcp.encoding,
      connections: [],
    });
  });

  it('reports the current session and how many are listed', () => {
    const { status, repository, sessions } = setup({ listener: null, connections: [] });
    const startedAt = new Date('2026-11-12T09:00:00.000Z');
    sessions.create({ name: 'a', run: null, startedAt });
    repository.add({
      kind: 'marker',
      text: 'm',
      receivedAt: startedAt,
      source: 'api',
      voice: null,
      connectionId: null,
      sessionId: 1,
    });
    sessions.endCurrent(startedAt);
    sessions.create({ name: 'b', run: 'r', startedAt });
    expect(status.status().session).toEqual({
      current: {
        id: 2,
        name: 'b',
        run: 'r',
        startedAt,
        endedAt: null,
        firstSeq: null,
        lastSeq: null,
        entries: 0,
      },
      count: 2,
    });
  });
});
