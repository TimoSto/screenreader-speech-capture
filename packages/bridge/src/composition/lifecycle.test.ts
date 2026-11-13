import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../test/fakes.js';
import type { BridgeState } from '../application/ports/in/get-status.js';
import type { ProcessSupervisor } from '../application/ports/out/process-supervisor.js';
import { DEFAULT_CONFIG, mergeConfig, type ConfigPatch } from '../domain/config/index.js';
import { runLifecycle } from './lifecycle.js';
import type { ChildService } from './services.js';

/** Records the lifecycle calls in order, across all fakes. */
function setup(patch: ConfigPatch = {}) {
  const calls: string[] = [];
  const starts: Record<string, () => void> = {};
  const service = (section: 'playwright' | 'mcp'): ChildService => ({
    section,
    supervisor: {
      start: () => new Promise<void>((resolve) => (starts[section] = resolve)),
    } as Partial<ProcessSupervisor> as ProcessSupervisor,
    settingsOf: () => ({ host: '', port: 0, version: null }),
  });
  const stoppable = (name: string, fail = false) => ({
    stop: () => {
      calls.push(`stop ${name}`);
      return fail ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve();
    },
  });
  const logger = new MemoryLogger();
  const parts = {
    config: mergeConfig(DEFAULT_CONFIG, patch),
    status: { setState: (state: BridgeState) => void calls.push(`state ${state}`) },
    waits: { shutdown: () => void calls.push('waits shutdown') },
    logger,
    services: [service('playwright'), service('mcp')],
  };
  return { calls, starts, logger, parts, stoppable };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('runLifecycle', () => {
  it('is ready at once when no child service is enabled', () => {
    const { calls, parts } = setup({ playwright: { enabled: false }, mcp: { enabled: false } });
    runLifecycle({ ...parts, stopOrder: [] });
    expect(calls).toEqual(['state ready']);
  });

  it('is ready once every enabled child service has settled', async () => {
    const { calls, starts, parts } = setup({ mcp: { enabled: false } });
    runLifecycle({ ...parts, stopOrder: [] });
    expect(Object.keys(starts)).toEqual(['playwright']);
    await flush();
    expect(calls).toEqual([]);
    starts.playwright!();
    await flush();
    expect(calls).toEqual(['state ready']);
  });

  it('stops: state, then pending waits, then each part in order, once', async () => {
    const { calls, parts, stoppable } = setup();
    const lifecycle = runLifecycle({ ...parts, stopOrder: [stoppable('tcp'), stoppable('http')] });
    const first = lifecycle.stop('SIGINT');
    expect(lifecycle.stop()).toBe(first);
    await first;
    expect(calls).toEqual(['state stopping', 'waits shutdown', 'stop tcp', 'stop http']);
  });

  it('does not report ready after a stop has begun', async () => {
    const { calls, starts, parts } = setup({ mcp: { enabled: false } });
    const lifecycle = runLifecycle({ ...parts, stopOrder: [] });
    await lifecycle.stop();
    starts.playwright!();
    await flush();
    expect(calls).not.toContain('state ready');
  });

  it('stops every part even if one fails, then rethrows', async () => {
    const { calls, parts, stoppable, logger } = setup();
    const lifecycle = runLifecycle({
      ...parts,
      stopOrder: [stoppable('tcp', true), stoppable('http')],
    });
    await expect(lifecycle.stop()).rejects.toThrow('tcp failed');
    expect(calls).toContain('stop http');
    expect(logger.lines).toContain('error shutdown failed: Error: tcp failed');
  });
});
