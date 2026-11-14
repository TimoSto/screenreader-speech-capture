import { describe, expect, it } from 'vitest';
import {
  CHILD_HOST,
  nextAfterCrash,
  reachability,
  RESTART_POLICY,
  serviceSettings,
} from './child-service.js';
import { DEFAULT_CONFIG, mergeConfig } from './config/index.js';

describe('nextAfterCrash', () => {
  it('restarts with a growing delay: 1 s, 2 s, 4 s, 8 s', () => {
    const delays = [0, 1, 2, 3].map((before) => nextAfterCrash(before, 100));
    expect(delays).toEqual([
      { action: 'restart', crashesInRow: 1, delayMs: 1000 },
      { action: 'restart', crashesInRow: 2, delayMs: 2000 },
      { action: 'restart', crashesInRow: 3, delayMs: 4000 },
      { action: 'restart', crashesInRow: 4, delayMs: 8000 },
    ]);
  });

  it('fails on the 5th crash in a row', () => {
    expect(nextAfterCrash(4, 100)).toEqual({ action: 'fail', crashesInRow: 5 });
  });

  it('starts a new streak after a stable run', () => {
    expect(nextAfterCrash(4, RESTART_POLICY.stableMs)).toEqual({
      action: 'restart',
      crashesInRow: 1,
      delayMs: 1000,
    });
  });

  it('caps the delay', () => {
    const policy = { ...RESTART_POLICY, maxCrashesInRow: 100 };
    expect(nextAfterCrash(20, 0, policy)).toMatchObject({ delayMs: 30_000 });
  });
});

describe('serviceSettings', () => {
  const config = mergeConfig(DEFAULT_CONFIG, {
    http: { host: '0.0.0.0' },
    playwright: { port: 3100, version: '1.66.0' },
    mcp: { port: 8900 },
  });

  it('runs every service on loopback, whatever the HTTP interface', () => {
    expect(serviceSettings('playwright', config)).toEqual({
      host: CHILD_HOST,
      port: 3100,
      version: '1.66.0',
    });
  });

  it('runs MCP in the bundled version', () => {
    expect(serviceSettings('mcp', config)).toEqual({
      host: '127.0.0.1',
      port: 8900,
      version: null,
    });
  });
});

describe('reachability', () => {
  it('is the port while the service runs', () => {
    expect(reachability('playwright', { state: 'running', port: 3000 }, true)).toEqual({
      port: 3000,
    });
  });

  it('says why otherwise: disabled, or the state it is in', () => {
    expect(reachability('playwright', { state: 'stopped', port: 3000 }, false)).toEqual({
      unavailable: 'Playwright server is disabled',
    });
    expect(reachability('mcp', { state: 'starting', port: 8931 }, true)).toEqual({
      unavailable: 'Playwright MCP is not running (state: starting)',
    });
  });
});
