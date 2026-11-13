import type { Config } from './types.js';

export const DEFAULT_CONFIG: Config = {
  tcp: {
    host: '127.0.0.1',
    port: 4449,
    format: 'text-to-socket',
    encoding: 'windows-1252',
    maxLineBytes: 65536,
  },
  http: { host: '0.0.0.0', port: 5151 },
  playwright: { enabled: true, port: 3000, version: null },
  mcp: { enabled: true, port: 8931 },
  input: { enabled: true },
  buffer: { maxEntries: 10000 },
  log: { level: 'info', file: null, consoleSpeech: false },
};
