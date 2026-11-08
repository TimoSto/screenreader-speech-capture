import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../../../application/ports/out/logger.js';
import { isExactVersion } from '../../../domain/config.js';
import type { RunCommand } from '../process/run-command.js';

export interface EnsurePlaywrightOptions {
  version: string;
  /** One folder per version below it. */
  cacheRoot: string;
  run: RunCommand;
  logger: Logger;
  signal?: AbortSignal;
  platform?: NodeJS.Platform;
}

const cliOf = (dir: string) => path.join(dir, 'node_modules', 'playwright', 'cli.js');

/**
 * Makes sure `playwright@<version>` and its Chromium are installed (docs/playwright-mcp.md)
 * and returns the path of its `cli.js`. The package goes into `<cacheRoot>/<version>` once.
 * The Chromium install runs every time: Playwright skips it when the build is already there.
 */
export async function ensurePlaywright(options: EnsurePlaywrightOptions): Promise<string> {
  const { version, cacheRoot, run, logger, signal } = options;
  // Checked by the config already. It goes on a shell command line on Windows.
  if (!isExactVersion(version)) {
    throw new Error(`Invalid Playwright version ${JSON.stringify(version)}`);
  }
  const dir = path.join(cacheRoot, version);
  const cli = cliOf(dir);
  const withSignal = signal ? { signal } : {};

  if (!existsSync(cli)) {
    logger.info(`installing playwright ${version} into ${dir}`);
    // Installed next to the target and renamed when complete, so an interrupted install
    // leaves no half-filled folder behind.
    const tmp = `${dir}.tmp-${process.pid}-${Date.now()}`;
    try {
      await mkdir(tmp, { recursive: true });
      await writeFile(path.join(tmp, 'package.json'), '{ "private": true }\n');
      // No path on the command line: `cwd` selects the folder, so only fixed words and the
      // checked version reach the shell.
      await run(
        'npm',
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', `playwright@${version}`],
        { cwd: tmp, shell: (options.platform ?? process.platform) === 'win32', ...withSignal },
      );
      if (!existsSync(cliOf(tmp))) throw new Error(`npm did not install playwright ${version}`);
      try {
        await rename(tmp, dir);
      } catch (error) {
        // Another bridge finished the same install first.
        if (!existsSync(cli)) throw error;
      }
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  }

  logger.info(`checking the Chromium of playwright ${version}`);
  await run(process.execPath, [cli, 'install', '--no-shell', 'chromium'], withSignal);
  return cli;
}
