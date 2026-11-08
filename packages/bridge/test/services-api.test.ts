import type {
  ErrorBodyDto,
  ServiceStatusDto,
  StatusDto,
} from '@screenreader-speech-capture/shared';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Prepare } from '../src/adapters/out/process/child-process-supervisor.js';
import type { Bridge } from '../src/main.js';
import { accepts, eventually, freePort, start } from './helpers.js';

const FAKE_SERVICE = path.resolve(import.meta.dirname, 'fixtures/fake-service.mjs');
const FAST = { baseDelayMs: 10, maxDelayMs: 40, stableMs: 60_000, maxCrashesInRow: 5 };

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Runs the fake service instead of installing Playwright. `--pid` goes to `pidFile`. */
function fakeLaunch(pidFile?: string): Prepare {
  return ({ port }) =>
    Promise.resolve({
      command: process.execPath,
      args: [FAKE_SERVICE, '--port', String(port), ...(pidFile ? ['--pid', pidFile] : [])],
    });
}

const api = (bridge: Bridge, route: string) => `http://127.0.0.1:${bridge.httpPort}/api/v1${route}`;

async function status(bridge: Bridge): Promise<StatusDto> {
  return (await (await fetch(api(bridge, '/status'))).json()) as StatusDto;
}

function post(bridge: Bridge, route: string, type = 'application/json') {
  return fetch(api(bridge, route), { method: 'POST', headers: { 'content-type': type } });
}

async function startWithPlaywright(patch: object = {}, pidFile?: string) {
  const port = await freePort();
  const bridge = await start(
    { playwright: { enabled: true, port }, ...patch },
    { playwrightLaunch: fakeLaunch(pidFile), restartPolicy: FAST },
  );
  return { bridge, port };
}

const ready = (bridge: Bridge) =>
  eventually(
    () => status(bridge),
    (s) => s.bridge.state === 'ready',
  );

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('Playwright server service', () => {
  it('is ready once the Playwright server runs, and reports it in the status', async () => {
    const { bridge, port } = await startWithPlaywright();

    const current = await ready(bridge);

    expect(current.bridge.state).toBe('ready');
    expect(current.playwright).toEqual({
      state: 'running',
      version: '1.65.0',
      port,
      restarts: 0,
      exitCode: null,
    });
    expect(await accepts(port)).toBe(true);
  });

  it('reports a disabled service as stopped', async () => {
    const bridge = await start();
    expect((await status(bridge)).playwright).toMatchObject({ state: 'stopped', port: 3000 });
  });

  it('stops, starts and restarts the service by hand', async () => {
    const { bridge, port } = await startWithPlaywright();
    await ready(bridge);

    const stopped = await post(bridge, '/services/playwright/stop');
    expect(stopped.status).toBe(200);
    expect(((await stopped.json()) as ServiceStatusDto).state).toBe('stopped');
    expect(await accepts(port)).toBe(false);

    const started = await post(bridge, '/services/playwright/start');
    expect(((await started.json()) as ServiceStatusDto).state).toBe('running');

    const restarted = await post(bridge, '/services/playwright/restart');
    expect(restarted.status).toBe(200);
    expect(((await restarted.json()) as ServiceStatusDto).state).toBe('running');
    expect(await accepts(port)).toBe(true);
  });

  it('rejects unknown services, disabled services and requests without JSON', async () => {
    const bridge = await start();

    const unknown = await post(bridge, '/services/nope/start');
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as ErrorBodyDto).error.code).toBe('NOT_FOUND');

    const disabled = await post(bridge, '/services/playwright/start');
    expect(disabled.status).toBe(503);
    expect(((await disabled.json()) as ErrorBodyDto).error.code).toBe('SERVICE_UNAVAILABLE');

    const form = await post(bridge, '/services/playwright/stop', 'text/plain');
    expect(form.status).toBe(400);
  });

  it('restarts on the new port after PUT /config, and stops when disabled', async () => {
    const { bridge, port } = await startWithPlaywright();
    await ready(bridge);
    const newPort = await freePort();

    const response = await fetch(api(bridge, '/config'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playwright: { port: newPort } }),
    });
    expect(response.status).toBe(200);

    const moved = await eventually(
      () => status(bridge),
      (s) => s.playwright?.state === 'running' && s.playwright.port === newPort,
    );
    expect(moved.playwright).toMatchObject({ state: 'running', port: newPort });
    expect(await accepts(port)).toBe(false);

    await fetch(api(bridge, '/config'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playwright: { enabled: false } }),
    });
    expect((await status(bridge)).playwright?.state).toBe('stopped');
    expect(await accepts(newPort)).toBe(false);
  });

  it('kills the Playwright server when the bridge stops', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'services-api-'));
    dirs.push(dir);
    const pidFile = path.join(dir, 'service.pid');
    const { bridge } = await startWithPlaywright({}, pidFile);
    await ready(bridge);
    const pid = Number(await readFile(pidFile, 'utf8'));
    expect(alive(pid)).toBe(true);

    await bridge.stop();

    expect(alive(pid)).toBe(false);
  });
});
