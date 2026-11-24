import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { eventually, freePort } from '../../../../test/helpers.js';
import { MemoryLogger } from '../../../../test/fakes.js';
import type { RestartPolicy } from '../../../domain/child-service.js';
import { ChildProcessSupervisor } from './child-process-supervisor.js';
import type { Prepare } from './types.js';

const FAKE_SERVICE = path.resolve(
  import.meta.dirname,
  '../../../../test/fixtures/fake-service.mjs',
);
const FAST: RestartPolicy = {
  baseDelayMs: 10,
  maxDelayMs: 40,
  stableMs: 60_000,
  maxCrashesInRow: 5,
};

const supervisors: ChildProcessSupervisor[] = [];
const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(supervisors.splice(0).map((supervisor) => supervisor.stop()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function fake(...args: string[]): Prepare {
  return ({ port }) =>
    Promise.resolve({
      command: process.execPath,
      args: [FAKE_SERVICE, '--port', String(port), ...args],
    });
}

async function setup(prepare: Prepare, port?: number, host = '0.0.0.0') {
  const logger = new MemoryLogger();
  const output = new MemoryLogger();
  const supervisor = new ChildProcessSupervisor({
    name: 'playwright',
    settings: { host, port: port ?? (await freePort()), version: null },
    defaultVersion: '9.9.9',
    prepare,
    logger,
    output,
    policy: FAST,
    probeIntervalMs: 10,
  });
  supervisors.push(supervisor);
  return { supervisor, logger, output };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('ChildProcessSupervisor', () => {
  it('start() resolves at once when the service is already running', async () => {
    const { supervisor } = await setup(fake());
    await supervisor.start();
    await supervisor.start();
    expect(supervisor.status().state).toBe('running');
  });

  it('does not start a child while something else holds the port', async () => {
    const holder = net.createServer().listen(0, '127.0.0.1');
    await once(holder, 'listening');
    const { port } = holder.address() as net.AddressInfo;
    const { supervisor, logger, output } = await setup(
      () => Promise.resolve({ command: process.execPath, args: ['-e', 'console.log("spawned")'] }),
      port,
    );
    try {
      void supervisor.start();
      await eventually(
        () => logger.lines.some((line) => line.includes(`port ${port} is already in use`)),
        Boolean,
      );
      // A spawned child would have printed this.
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(output.lines).not.toContain('info spawned');
      expect(supervisor.status().state).not.toBe('running');
    } finally {
      holder.close();
    }
  });

  it('is running once the port answers, with its output in the log', async () => {
    const { supervisor, output, logger } = await setup(fake());
    expect(supervisor.status()).toMatchObject({ state: 'stopped', version: '9.9.9' });

    await supervisor.start();

    expect(supervisor.status()).toMatchObject({ state: 'running', restarts: 0, exitCode: null });
    await eventually(
      () => output.lines,
      (lines) => lines.some((line) => line.startsWith('info Listening on')),
    );
    expect(output.lines).toContain('warn fake service warming up');
    expect(logger.lines).toEqual(
      expect.arrayContaining([expect.stringMatching(/^info playwright running \(\d+\.\ds\)$/)]),
    );
    expect(logger.lines).toContain('info starting playwright 9.9.9');
  });

  it('has a pid only while running', async () => {
    const { supervisor } = await setup(fake());
    expect(supervisor.pid()).toBeNull();
    await supervisor.start();
    expect(supervisor.pid()).toEqual(expect.any(Number));
    await supervisor.stop();
    expect(supervisor.pid()).toBeNull();
  });

  it('restarts after crashes and fails after 5 in a row', async () => {
    const { supervisor, logger } = await setup(fake('--exit', '3'));

    void supervisor.start();

    // Not `await start()`: the port is only known free a moment ago, so the port check can see
    // something else on it and report `running` early. The child still exits with 3 every time.
    await eventually(
      () => supervisor.status(),
      (status) => status.state === 'failed',
      500,
    );
    expect(supervisor.status()).toMatchObject({ state: 'failed', restarts: 4, exitCode: 3 });
    expect(logger.lines.filter((line) => line.includes('exited with code 3'))).toEqual([
      'error playwright exited with code 3, restart 1 in 10 ms',
      'error playwright exited with code 3, restart 2 in 20 ms',
      'error playwright exited with code 3, restart 3 in 40 ms',
      'error playwright exited with code 3, restart 4 in 40 ms',
      'error playwright exited with code 3, 5 crashes in a row: giving up. Restart the bridge to try again',
    ]);
  });

  it('counts a failed prepare as a crash', async () => {
    const { supervisor, logger } = await setup(() => Promise.reject(new Error('npm failed')));
    await supervisor.start();
    expect(supervisor.status().state).toBe('failed');
    expect(logger.lines).toContain('error playwright could not be prepared: npm failed');
  });

  it('restarts a crashed service, and a start after a stop starts over with a fresh count', async () => {
    let crashes = 2;
    const { supervisor } = await setup((settings, signal) =>
      crashes-- > 0 ? fake('--exit', '1')(settings, signal) : fake()(settings, signal),
    );
    void supervisor.start();
    // Waits for the end state, not `start()`, for the same reason as the test above.
    await eventually(
      () => supervisor.status(),
      (status) => status.state === 'running' && status.restarts === 2,
      500,
    );
    expect(supervisor.status()).toMatchObject({ state: 'running', restarts: 2, exitCode: 1 });

    await supervisor.stop();
    await supervisor.start();
    expect(supervisor.status()).toMatchObject({ state: 'running', restarts: 0, exitCode: null });
  });

  it('restarts a service that was killed from outside', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'supervisor-'));
    dirs.push(dir);
    const pidFile = path.join(dir, 'grandchild.pid');
    const servicePidFile = path.join(dir, 'service.pid');
    const { supervisor } = await setup(fake('--grandchild', pidFile, '--pid', servicePidFile));
    await supervisor.start();
    const grandchild = Number(await readFile(pidFile, 'utf8'));

    // Kill only the service itself: its child must go too, and the service comes back.
    process.kill(Number(await readFile(servicePidFile, 'utf8')), 'SIGKILL');

    await eventually(
      () => supervisor.status(),
      (status) => status.state === 'running' && status.restarts === 1,
    );
    expect(supervisor.status()).toMatchObject({ state: 'running', restarts: 1 });
    expect(alive(grandchild)).toBe(false);
  });

  it('kills the whole process tree on stop', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'supervisor-'));
    dirs.push(dir);
    const pidFile = path.join(dir, 'grandchild.pid');
    const { supervisor } = await setup(fake('--grandchild', pidFile));
    await supervisor.start();
    const grandchild = Number(await readFile(pidFile, 'utf8'));
    expect(alive(grandchild)).toBe(true);

    await supervisor.stop();

    expect(supervisor.status().state).toBe('stopped');
    await eventually(
      () => alive(grandchild),
      (isAlive) => !isAlive,
    );
    expect(alive(grandchild)).toBe(false);
  });
});
