import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../test/fakes.js';
import type { BridgeState } from '../ports/in/get-status.js';
import type { Stoppable } from '../ports/in/lifecycle.js';
import { BridgeLifecycleService } from './bridge-lifecycle-service.js';

/** Records the lifecycle calls in order, across all fakes. */
function setup(stopOrder: (calls: string[]) => Stoppable[] = () => []) {
  const calls: string[] = [];
  let servicesStarted!: () => void;
  const logger = new MemoryLogger();
  const lifecycle = new BridgeLifecycleService({
    state: { setState: (state: BridgeState) => void calls.push(`state ${state}`) },
    waits: { shutdown: () => void calls.push('waits shutdown') },
    startServices: () => new Promise<void>((resolve) => (servicesStarted = resolve)),
    stopOrder: stopOrder(calls),
    logger,
  });
  return { calls, logger, lifecycle, servicesStarted: () => servicesStarted() };
}

const stoppable = (calls: string[], name: string, fail = false): Stoppable => ({
  stop: () => {
    calls.push(`stop ${name}`);
    return fail ? Promise.reject(new Error(`${name} failed`)) : Promise.resolve();
  },
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('BridgeLifecycleService', () => {
  it('is ready once the child services have settled', async () => {
    const { calls, lifecycle, servicesStarted, logger } = setup();
    lifecycle.start();
    await flush();
    expect(calls).toEqual([]);
    servicesStarted();
    await flush();
    expect(calls).toEqual(['state ready']);
    expect(logger.lines).toContain('info ready');
  });

  it('stops: state, then pending waits, then each part in order, once', async () => {
    const { calls, lifecycle } = setup((calls) => [
      stoppable(calls, 'tcp'),
      stoppable(calls, 'http'),
    ]);
    const first = lifecycle.stop('SIGINT');
    expect(lifecycle.stop()).toBe(first);
    await first;
    expect(calls).toEqual(['state stopping', 'waits shutdown', 'stop tcp', 'stop http']);
  });

  it('does not report ready after a stop has begun', async () => {
    const { calls, lifecycle, servicesStarted } = setup();
    lifecycle.start();
    await lifecycle.stop();
    servicesStarted();
    await flush();
    expect(calls).not.toContain('state ready');
  });

  it('stops every part even if one fails, then rethrows', async () => {
    const { calls, lifecycle, logger } = setup((calls) => [
      stoppable(calls, 'tcp', true),
      stoppable(calls, 'http'),
    ]);
    await expect(lifecycle.stop()).rejects.toThrow('tcp failed');
    expect(calls).toContain('stop http');
    expect(logger.lines).toContain('error shutdown failed: Error: tcp failed');
  });

  it('collects several failures into one AggregateError', async () => {
    const { lifecycle } = setup((calls) => [
      stoppable(calls, 'tcp', true),
      stoppable(calls, 'http', true),
    ]);
    const error = await lifecycle.stop().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AggregateError);
    expect((error as AggregateError).errors).toHaveLength(2);
  });
});
