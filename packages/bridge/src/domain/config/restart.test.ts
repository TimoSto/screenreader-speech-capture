import { expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './defaults.js';
import { configFields } from './fields.js';
import { mergeConfig } from './merge.js';
import { liveConfig, RESTART_FIELDS } from './restart.js';

it('keeps exactly the restart-only settings of the running config', () => {
  // Every setting changed, so each one shows whether liveConfig keeps it.
  const next = mergeConfig(DEFAULT_CONFIG, {
    tcp: { host: '0.0.0.0', port: 1, encoding: 'utf-8', maxLineBytes: 2048 },
    http: { host: '127.0.0.1', port: 2, allowedHosts: ['vm'] },
    playwright: { enabled: false, port: 3, version: '1.0.0' },
    mcp: { enabled: false, port: 4 },
    buffer: { maxEntries: 5 },
    log: { level: 'debug', file: 'x.log', consoleSpeech: true },
  });
  const live = configFields(liveConfig(next, DEFAULT_CONFIG));
  const running = configFields(DEFAULT_CONFIG);
  const kept = [...live].filter(([field, value]) => value === running.get(field)).map(([f]) => f);
  expect(new Set(kept)).toEqual(RESTART_FIELDS);
});
