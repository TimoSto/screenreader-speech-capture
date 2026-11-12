// Playwright MCP shares the supervisor with the Playwright server (playwright-service.test.ts
// covers it in depth). These tests check the MCP wiring: status, config changes, shutdown.
import type { StatusDto } from '@screenreader-speech-capture/shared';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Prepare } from '../src/adapters/out/process/child-process-supervisor.js';
import type { Bridge } from '../src/main.js';
import { accepts, eventually, freePort, start } from './helpers.js';

const FAKE_SERVICE = path.resolve(import.meta.dirname, 'fixtures/fake-service.mjs');

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Runs the fake service instead of installing MCP. `--pid` goes to `pidFile`. */
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

async function putConfig(bridge: Bridge, patch: object): Promise<number> {
  const response = await fetch(api(bridge, '/config'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return response.status;
}

async function startWithMcp(pidFile?: string) {
  const port = await freePort();
  const bridge = await start({ mcp: { enabled: true, port } }, { mcpLaunch: fakeLaunch(pidFile) });
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

describe('Playwright MCP service', () => {
  it('is ready once MCP runs, and reports it in the status', async () => {
    const { bridge, port } = await startWithMcp();

    const current = await ready(bridge);

    expect(current.mcp).toEqual({
      state: 'running',
      version: '0.0.85',
      port,
      restarts: 0,
      exitCode: null,
    });
    expect(current.playwright?.state).toBe('stopped');
    expect(await accepts(port)).toBe(true);
  });

  it('restarts on the new port after PUT /config, and stops when disabled', async () => {
    const { bridge, port } = await startWithMcp();
    await ready(bridge);
    const newPort = await freePort();

    expect(await putConfig(bridge, { mcp: { port: newPort } })).toBe(200);

    const moved = await eventually(
      () => status(bridge),
      (s) => s.mcp?.state === 'running' && s.mcp.port === newPort,
    );
    expect(moved.mcp).toMatchObject({ state: 'running', port: newPort });
    expect(await accepts(port)).toBe(false);

    expect(await putConfig(bridge, { mcp: { enabled: false } })).toBe(200);
    expect((await status(bridge)).mcp?.state).toBe('stopped');
    expect(await accepts(newPort)).toBe(false);
  });

  it('rejects a version that is not exact', async () => {
    const bridge = await start();
    expect(await putConfig(bridge, { mcp: { version: 'latest' } })).toBe(400);
  });

  it('kills MCP when the bridge stops', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'mcp-service-'));
    dirs.push(dir);
    const pidFile = path.join(dir, 'service.pid');
    const { bridge } = await startWithMcp(pidFile);
    await ready(bridge);
    const pid = Number(await readFile(pidFile, 'utf8'));
    expect(alive(pid)).toBe(true);

    await bridge.stop();

    expect(alive(pid)).toBe(false);
  });
});
