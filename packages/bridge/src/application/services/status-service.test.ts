import { describe, expect, it } from 'vitest';
import { MemorySpeechRepository } from '../../adapters/out/memory/memory-speech-repository.js';
import { DEFAULT_CONFIG } from '../../domain/config.js';
import type { CaptureStatus } from '../../domain/capture.js';
import { StatusService } from './status-service.js';

function setup(capture: CaptureStatus) {
  const repository = new MemorySpeechRepository(10);
  const status = new StatusService({
    capture: { captureStatus: () => capture },
    repository,
    playwright: {
      status: () => ({ state: 'running', version: '1.65.0', port: 3000, restarts: 1, exitCode: 1 }),
    },
    mcp: {
      status: () => ({ state: 'failed', version: '0.0.85', port: 8931, restarts: 4, exitCode: 2 }),
    },
    config: () => DEFAULT_CONFIG,
    version: '1.2.3',
    apiVersion: '1.0',
  });
  return { status, repository };
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
    });
    status.setState('ready');

    expect(status.status()).toEqual({
      bridge: { version: '1.2.3', apiVersion: '1.0', state: 'ready' },
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
});
