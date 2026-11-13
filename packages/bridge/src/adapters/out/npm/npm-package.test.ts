import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import type { RunCommand, RunOptions } from '../process/run-command.js';
import { ensureNpmPackage } from './npm-package.js';

let cacheRoot: string;
beforeEach(async () => {
  cacheRoot = await mkdtemp(path.join(os.tmpdir(), 'npm-package-'));
});
afterEach(() => rm(cacheRoot, { recursive: true, force: true }));

interface Call {
  command: string;
  args: readonly string[];
  options: RunOptions | undefined;
}

/** A fake `npm install` that writes `<cwd>/node_modules/<name>/<entry>` unless told not to. */
function fakeNpm(behaviour: { install?: boolean; fail?: Error } = {}) {
  const calls: Call[] = [];
  const run: RunCommand = async (command, args, options) => {
    calls.push({ command, args, options });
    if (behaviour.fail) throw behaviour.fail;
    if (behaviour.install === false) return;
    const spec = args.at(-1)!;
    const name = spec.slice(0, spec.lastIndexOf('@'));
    const dir = path.join(options!.cwd!, 'node_modules', ...name.split('/'));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'cli.js'), '');
  };
  return { run, calls };
}

const options = (run: RunCommand, extra: object = {}) => ({
  name: '@scope/tool',
  version: '1.2.3',
  cacheRoot,
  entry: 'cli.js',
  run,
  logger: new MemoryLogger(),
  ...extra,
});

describe('ensureNpmPackage', () => {
  it('installs into <cacheRoot>/<version> with scripts off, and leaves no temp folder', async () => {
    const { run, calls } = fakeNpm();
    const pkg = await ensureNpmPackage(options(run, { platform: 'linux' }));
    const dir = path.join(cacheRoot, '1.2.3');
    expect(pkg).toEqual({ dir, entry: path.join(dir, 'node_modules', '@scope', 'tool', 'cli.js') });
    expect(existsSync(pkg.entry)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.command).toBe('npm');
    expect(calls[0]!.args).toEqual([
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '@scope/tool@1.2.3',
    ]);
    expect(calls[0]!.options?.shell).toBe(false);
    expect(await readdir(cacheRoot)).toEqual(['1.2.3']);
  });

  it('runs npm through the shell on Windows (npm.cmd)', async () => {
    const { run, calls } = fakeNpm();
    await ensureNpmPackage(options(run, { platform: 'win32' }));
    expect(calls[0]!.options?.shell).toBe(true);
  });

  it('does not run npm again for a version that is installed', async () => {
    const { run, calls } = fakeNpm();
    await ensureNpmPackage(options(run));
    await ensureNpmPackage(options(run));
    expect(calls).toHaveLength(1);
  });

  it('passes the abort signal on', async () => {
    const { run, calls } = fakeNpm();
    const signal = new AbortController().signal;
    await ensureNpmPackage(options(run, { signal }));
    expect(calls[0]!.options?.signal).toBe(signal);
  });

  it.each(['latest', '^1.2.3', '1.2.3 && calc'])(
    'rejects the version %j before running anything',
    async (version) => {
      const { run, calls } = fakeNpm();
      await expect(ensureNpmPackage(options(run, { version }))).rejects.toThrow(/Invalid/);
      expect(calls).toEqual([]);
    },
  );

  it('fails when npm did not produce the entry, leaving nothing behind', async () => {
    const { run } = fakeNpm({ install: false });
    await expect(ensureNpmPackage(options(run))).rejects.toThrow(
      'npm did not install @scope/tool 1.2.3',
    );
    expect(await readdir(cacheRoot)).toEqual([]);
  });

  it('removes the temp folder when npm fails', async () => {
    const { run } = fakeNpm({ fail: new Error('npm exited with code 1') });
    await expect(ensureNpmPackage(options(run))).rejects.toThrow('npm exited with code 1');
    expect(await readdir(cacheRoot)).toEqual([]);
  });

  it('accepts an install another bridge finished first', async () => {
    const { run: install } = fakeNpm();
    // While this install runs, "another bridge" completes the same version.
    const racing: RunCommand = async (command, args, opts) => {
      await install(command, args, opts);
      await install(command, args, { ...opts, cwd: path.join(cacheRoot, '1.2.3') });
    };
    const pkg = await ensureNpmPackage(options(racing));
    expect(existsSync(pkg.entry)).toBe(true);
    expect(await readdir(cacheRoot)).toEqual(['1.2.3']);
  });
});
