import { existsSync, readdirSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import type { RunCommand, RunOptions } from '../process/run-command.js';
import { ensurePlaywright } from './playwright-installer.js';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'playwright-cache-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

interface Call {
  command: string;
  args: readonly string[];
  options: RunOptions | undefined;
}

/** `npm install` creates `node_modules/playwright/cli.js` in its cwd, unless `fail`. */
function fakeRun(calls: Call[], { fail = false } = {}): RunCommand {
  return async (command, args, options) => {
    calls.push({ command, args, options });
    if (command !== 'npm') return;
    if (fail) throw new Error('npm exited with code 1');
    const dir = path.join(options!.cwd!, 'node_modules', 'playwright');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'cli.js'), '');
  };
}

describe('ensurePlaywright', () => {
  it('installs the version once into its own folder, then Chromium every time', async () => {
    const calls: Call[] = [];
    const options = { version: '1.65.0', cacheRoot: root, logger: new MemoryLogger() };
    const cli = path.join(root, '1.65.0', 'node_modules', 'playwright', 'cli.js');

    expect(await ensurePlaywright({ ...options, run: fakeRun(calls), platform: 'linux' })).toBe(
      cli,
    );
    expect(await ensurePlaywright({ ...options, run: fakeRun(calls), platform: 'linux' })).toBe(
      cli,
    );

    expect(calls.map(({ command, args }) => [command, ...args].join(' '))).toEqual([
      'npm install --ignore-scripts --no-audit --no-fund playwright@1.65.0',
      `${process.execPath} ${cli} install --no-shell chromium`,
      `${process.execPath} ${cli} install --no-shell chromium`,
    ]);
    expect(calls[0]!.options).toMatchObject({ shell: false });
    expect(readdirSync(root)).toEqual(['1.65.0']);
  });

  it('runs npm through the shell on Windows', async () => {
    const calls: Call[] = [];
    await ensurePlaywright({
      version: '1.65.0',
      cacheRoot: root,
      logger: new MemoryLogger(),
      run: fakeRun(calls),
      platform: 'win32',
    });
    expect(calls[0]!.options).toMatchObject({ shell: true });
  });

  it('leaves nothing behind when npm fails', async () => {
    const calls: Call[] = [];
    await expect(
      ensurePlaywright({
        version: '1.65.0',
        cacheRoot: root,
        logger: new MemoryLogger(),
        run: fakeRun(calls, { fail: true }),
      }),
    ).rejects.toThrow('npm exited with code 1');
    expect(readdirSync(root)).toEqual([]);
    expect(existsSync(path.join(root, '1.65.0'))).toBe(false);
  });

  it('refuses anything but an exact version', async () => {
    const calls: Call[] = [];
    await expect(
      ensurePlaywright({
        version: '1.65.0 & calc',
        cacheRoot: root,
        logger: new MemoryLogger(),
        run: fakeRun(calls),
      }),
    ).rejects.toThrow('Invalid Playwright version');
    expect(calls).toEqual([]);
  });
});
