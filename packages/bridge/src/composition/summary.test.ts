import { describe, expect, it } from 'vitest';
import type { ProcessSupervisor } from '../application/ports/out/process-supervisor.js';
import { DEFAULT_CONFIG, mergeConfig } from '../domain/config/index.js';
import { readySummary } from './summary.js';

const supervisor = (state: string, version: string): ProcessSupervisor =>
  ({ status: () => ({ state, version, port: 1, restarts: 0, exitCode: null }) }) as never;

const base = {
  config: mergeConfig(DEFAULT_CONFIG, { http: { host: '127.0.0.1' }, tcp: { host: '127.0.0.1' } }),
  ports: { tcp: 4449, http: 5151 },
  tookMs: 2345,
  webUi: false,
};

describe('readySummary', () => {
  it('lists what runs where, one row per component', () => {
    const text = readySummary({
      ...base,
      supervisors: {
        playwright: supervisor('running', '1.65.0'),
        mcp: supervisor('running', '0.0.85'),
      },
      nativeInput: 'robotjs',
    });
    expect(text.split('\n')).toEqual([
      'ready in 2.3s',
      expect.stringMatching(/^ {2}speech capture +127\.0\.0\.1:4449 \(/),
      expect.stringMatching(/^ {2}HTTP API +http:\/\/127\.0\.0\.1:5151$/),
      expect.stringMatching(/ws:\/\/127\.0\.0\.1:5151\/playwright \(1\.65\.0\)$/),
      expect.stringMatching(/http:\/\/127\.0\.0\.1:5151\/playwright-mcp \(0\.0\.85\)$/),
      expect.stringMatching(/^ {2}native input +robotjs$/),
    ]);
  });

  it('names the web UI when it is served', () => {
    const text = readySummary({
      ...base,
      webUi: true,
      supervisors: {
        playwright: supervisor('running', '1.65.0'),
        mcp: supervisor('running', '0.0.85'),
      },
      nativeInput: null,
    });
    expect(text).toMatch(/HTTP API \+ web UI +http:\/\/127\.0\.0\.1:5151\n/);
  });

  it('says so when a service failed or native input is off', () => {
    const text = readySummary({
      ...base,
      supervisors: {
        playwright: supervisor('failed', '1.65.0'),
        mcp: supervisor('running', '0.0.85'),
      },
      nativeInput: null,
    });
    expect(text).toMatch(/FAILED, see the log above \(1\.65\.0\)/);
    expect(text).toMatch(/native input +off$/);
  });
});
