import type { Logger } from '../../../application/ports/out/logger.js';
import { ensureNpmPackage } from '../npm/npm-package.js';
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

/**
 * Makes sure `playwright@<version>` and its Chromium are installed (docs/playwright-mcp.md)
 * and returns the path of its `cli.js`. The package goes into `<cacheRoot>/<version>` once.
 * The Chromium install runs every time: Playwright skips it when the build is already there.
 */
export async function ensurePlaywright(options: EnsurePlaywrightOptions): Promise<string> {
  const { version, run, logger, signal } = options;
  const { entry: cli } = await ensureNpmPackage({
    ...options,
    name: 'playwright',
    entry: 'cli.js',
  });
  logger.info(`checking the Chromium of playwright ${version}`);
  await run(process.execPath, [cli, 'install', '--no-shell', 'chromium'], signal ? { signal } : {});
  return cli;
}
