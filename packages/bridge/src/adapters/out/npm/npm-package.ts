import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../../../application/ports/out/logger.js';
import { isExactVersion } from '../../../domain/version.js';
import type { RunCommand } from '../process/run-command.js';

export interface EnsureNpmPackageOptions {
  /** npm package name. A constant, never from the config: it goes on a command line. */
  name: string;
  version: string;
  /** One folder per version below it. */
  cacheRoot: string;
  /** File inside the package that shows the install is complete, for example `cli.js`. */
  entry: string;
  run: RunCommand;
  logger: Logger;
  signal?: AbortSignal;
  platform?: NodeJS.Platform;
}

export interface NpmPackage {
  /** `<cacheRoot>/<version>`, the folder with `node_modules`. */
  readonly dir: string;
  /** Path of `entry`. */
  readonly entry: string;
}

const entryOf = (dir: string, name: string, entry: string) =>
  path.join(dir, 'node_modules', ...name.split('/'), entry);

/**
 * Makes sure `<name>@<version>` is installed into `<cacheRoot>/<version>` (once per version,
 * docs/usage/playwright-mcp.md#install). npm install scripts are off.
 */
export async function ensureNpmPackage(options: EnsureNpmPackageOptions): Promise<NpmPackage> {
  const { name, version, cacheRoot, entry, run, logger, signal } = options;
  // Checked by the config already. It goes on a shell command line on Windows.
  if (!isExactVersion(version)) {
    throw new Error(`Invalid ${name} version ${JSON.stringify(version)}`);
  }
  const dir = path.join(cacheRoot, version);
  const installed = entryOf(dir, name, entry);
  if (existsSync(installed)) return { dir, entry: installed };

  logger.info(`installing ${name} ${version} into ${dir}`);
  // Installed next to the target and renamed when complete, so an interrupted install leaves
  // no half-filled folder behind.
  const tmp = `${dir}.tmp-${process.pid}-${Date.now()}`;
  try {
    await mkdir(tmp, { recursive: true });
    await writeFile(path.join(tmp, 'package.json'), '{ "private": true }\n');
    // No path on the command line: `cwd` selects the folder, so only fixed words and the
    // checked version reach the shell.
    await run(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', `${name}@${version}`],
      {
        cwd: tmp,
        shell: (options.platform ?? process.platform) === 'win32',
        ...(signal ? { signal } : {}),
      },
    );
    if (!existsSync(entryOf(tmp, name, entry))) {
      throw new Error(`npm did not install ${name} ${version}`);
    }
    try {
      await rename(tmp, dir);
    } catch (error) {
      // Another bridge finished the same install first.
      if (!existsSync(installed)) throw error;
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return { dir, entry: installed };
}
