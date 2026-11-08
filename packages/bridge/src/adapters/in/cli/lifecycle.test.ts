import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import { runUntilStopped, shutdownSignals, type LifecycleProcess } from './lifecycle.js';

class FakeProcess extends EventEmitter implements LifecycleProcess {
  readonly exits: number[] = [];

  constructor(readonly platform: NodeJS.Platform = 'linux') {
    super();
  }

  exit(code: number): void {
    this.exits.push(code);
  }
}

class FakeBridge {
  readonly log = new MemoryLogger();
  readonly reasons: (string | undefined)[] = [];
  private finish: { resolve: () => void; reject: (error: Error) => void } | undefined;

  stop(reason?: string): Promise<void> {
    this.reasons.push(reason);
    return new Promise((resolve, reject) => (this.finish = { resolve, reject }));
  }

  stopped(): void {
    this.finish?.resolve();
  }

  failed(): void {
    this.finish?.reject(new Error('port stuck'));
  }
}

let proc: FakeProcess;
let bridge: FakeBridge;
let flushes: number;

async function run(platform: NodeJS.Platform = 'linux') {
  proc = new FakeProcess(platform);
  bridge = new FakeBridge();
  flushes = 0;
  await runUntilStopped(() => Promise.resolve(bridge), proc, {
    timeoutMs: 10_000,
    flush: () => {
      flushes++;
      return Promise.resolve();
    },
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('runUntilStopped', () => {
  it('stops on SIGTERM, flushes and exits with 0', async () => {
    await run();
    proc.emit('SIGTERM');
    expect(bridge.reasons).toEqual(['SIGTERM']);
    expect(proc.exits).toEqual([]);

    bridge.stopped();
    await vi.runOnlyPendingTimersAsync();
    expect(flushes).toBe(1);
    expect(proc.exits).toEqual([0]);
  });

  it('exits with 1 when stopping fails', async () => {
    await run();
    proc.emit('SIGINT');
    bridge.failed();
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits).toEqual([1]);
  });

  it('exits at once on a second signal', async () => {
    await run();
    proc.emit('SIGINT');
    proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(0);
    expect(bridge.reasons).toEqual(['SIGINT']);
    expect(bridge.log.lines).toContain('warn SIGINT again, exiting without waiting');
    expect(proc.exits).toEqual([1]);
  });

  it('exits with 1 when the shutdown hangs', async () => {
    await run();
    proc.emit('SIGTERM');
    await vi.advanceTimersByTimeAsync(9_999);
    expect(proc.exits).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(bridge.log.lines).toContain('error shutdown did not finish within 10 s, exiting');
    expect(proc.exits).toEqual([1]);
  });

  it('logs an uncaught exception with its stack, stops and exits with 1', async () => {
    await run();
    const error = new Error('boom');
    proc.emit('uncaughtException', error);
    expect(bridge.log.lines).toEqual([`error uncaught exception: ${error.stack}`]);
    expect(bridge.reasons).toEqual(['crash']);

    bridge.stopped();
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits).toEqual([1]);
  });

  it('logs an unhandled rejection and exits with 1, even during a shutdown', async () => {
    await run();
    proc.emit('SIGTERM');
    proc.emit('unhandledRejection', 'nope');
    expect(bridge.log.lines).toEqual(['error unhandled rejection: nope']);
    expect(bridge.reasons).toEqual(['SIGTERM']);

    bridge.stopped();
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits).toEqual([1]);
  });

  it('stops right after starting when a signal came during the start', async () => {
    proc = new FakeProcess();
    bridge = new FakeBridge();
    let started!: (b: FakeBridge) => void;
    const running = runUntilStopped(
      () => new Promise<FakeBridge>((resolve) => (started = resolve)),
      proc,
      { flush: () => Promise.resolve() },
    );
    proc.emit('SIGTERM');
    started(bridge);
    await running;
    expect(bridge.reasons).toEqual(['SIGTERM']);

    bridge.stopped();
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits).toEqual([0]);
  });

  it('exits at a second signal while still starting', async () => {
    proc = new FakeProcess();
    void runUntilStopped(() => new Promise<FakeBridge>(() => undefined), proc, {
      flush: () => Promise.resolve(),
    });
    proc.emit('SIGINT');
    expect(proc.exits).toEqual([]);
    proc.emit('SIGINT');
    await vi.advanceTimersByTimeAsync(0);
    expect(proc.exits).toEqual([1]);
  });

  it('rejects like start and leaves the exit to the caller', async () => {
    proc = new FakeProcess();
    await expect(
      runUntilStopped(() => Promise.reject(new Error('port in use')), proc),
    ).rejects.toThrow('port in use');
    expect(proc.exits).toEqual([]);
  });

  it('listens for Ctrl+Break only on Windows', async () => {
    expect(shutdownSignals('linux')).toEqual(['SIGINT', 'SIGTERM', 'SIGHUP']);
    expect(shutdownSignals('win32')).toContain('SIGBREAK');
    await run('win32');
    proc.emit('SIGBREAK');
    expect(bridge.reasons).toEqual(['SIGBREAK']);
  });
});
