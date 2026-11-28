import type { StatusDto } from '@screenreader-speech-capture/shared';

const service = {
  state: 'running',
  version: '1.65.0',
  port: 3000,
  restarts: 0,
  exitCode: null,
} as const;

const DEFAULTS: StatusDto = {
  bridge: {
    version: '0.9.0',
    apiVersion: '1.24',
    state: 'ready',
    startedAt: '2026-11-12T09:00:00.000Z',
  },
  tcp: {
    listening: true,
    host: '127.0.0.1',
    port: 4449,
    encoding: 'windows-1252',
    connections: [],
  },
  buffer: { size: 0, maxEntries: 10000, firstSeq: null, lastSeq: null },
  playwright: service,
  mcp: { ...service, version: '0.0.85', port: 8931 },
  session: { current: null, count: 0 },
  input: {
    native: { available: true, backend: 'robotjs', reason: null },
    focus: { available: true, backend: 'koffi', reason: null },
  },
};

/** A status as the bridge answers it: a ready bridge with `changes` on top. */
export function statusWith(changes: Partial<StatusDto> = {}): StatusDto {
  return { ...structuredClone(DEFAULTS), ...changes };
}
