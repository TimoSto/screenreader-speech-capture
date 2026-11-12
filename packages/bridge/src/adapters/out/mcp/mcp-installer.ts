import type { Logger } from '../../../application/ports/out/logger.js';
import { ensureNpmPackage } from '../npm/npm-package.js';
import type { RunCommand } from '../process/run-command.js';

export interface EnsurePlaywrightMcpOptions {
  version: string;
  /** One folder per version below it. */
  cacheRoot: string;
  run: RunCommand;
  logger: Logger;
  signal?: AbortSignal;
  platform?: NodeJS.Platform;
}

/**
 * Makes sure `@playwright/mcp@<version>` and the Chromium of its own Playwright are installed
 * (docs/playwright-mcp.md#playwright-mcp) and returns the path of its `cli.js`. The package goes
 * into `<cacheRoot>/<version>` once. The Chromium install (`cli.js install-browser`, Playwright's
 * `install` with MCP's Playwright) runs every time and skips a build that is already there.
 */
export async function ensurePlaywrightMcp(options: EnsurePlaywrightMcpOptions): Promise<string> {
  const { version, run, logger, signal } = options;
  const { entry: cli } = await ensureNpmPackage({
    ...options,
    name: '@playwright/mcp',
    entry: 'cli.js',
  });
  logger.info(`checking the Chromium of playwright mcp ${version}`);
  await run(
    process.execPath,
    [cli, 'install-browser', '--no-shell', 'chromium'],
    signal ? { signal } : {},
  );
  return cli;
}
