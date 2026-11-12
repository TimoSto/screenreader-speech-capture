import { readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import type { RunCommand } from '../process/run-command.js';
import { ensurePlaywrightMcp } from './mcp-installer.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'mcp-cache-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** `npm install` creates `node_modules/@playwright/mcp/cli.js` in its cwd. */
function fakeRun(calls: string[]): RunCommand {
  return async (command, args, options) => {
    calls.push([command, ...args].join(' '));
    if (command !== 'npm') return;
    const dir = path.join(options!.cwd!, 'node_modules', '@playwright', 'mcp');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'cli.js'), '');
  };
}

describe('ensurePlaywrightMcp', () => {
  it('installs the version once, then the Chromium of its Playwright every time', async () => {
    const calls: string[] = [];
    const options = { version: '0.0.85', cacheRoot: root, logger: new MemoryLogger() };
    const cli = path.join(root, '0.0.85', 'node_modules', '@playwright', 'mcp', 'cli.js');

    expect(await ensurePlaywrightMcp({ ...options, run: fakeRun(calls) })).toBe(cli);
    expect(await ensurePlaywrightMcp({ ...options, run: fakeRun(calls) })).toBe(cli);

    expect(calls).toEqual([
      'npm install --ignore-scripts --no-audit --no-fund @playwright/mcp@0.0.85',
      `${process.execPath} ${cli} install-browser --no-shell chromium`,
      `${process.execPath} ${cli} install-browser --no-shell chromium`,
    ]);
    expect(readdirSync(root)).toEqual(['0.0.85']);
  });

  it('refuses anything but an exact version', async () => {
    const calls: string[] = [];
    await expect(
      ensurePlaywrightMcp({
        version: 'latest',
        cacheRoot: root,
        logger: new MemoryLogger(),
        run: fakeRun(calls),
      }),
    ).rejects.toThrow('Invalid @playwright/mcp version');
    expect(calls).toEqual([]);
  });
});
