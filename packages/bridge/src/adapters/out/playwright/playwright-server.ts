import type { Logger } from '../../../application/ports/out/logger.js';
import type { ServiceSettings } from '../../../application/ports/out/process-supervisor.js';
import type { RestartPolicy } from '../../../domain/service.js';
import { ChildProcessSupervisor, type Prepare } from '../process/child-process-supervisor.js';
import { runCommand } from '../process/run-command.js';
import { ensurePlaywright } from './playwright-installer.js';

/**
 * Playwright version of the server when `playwright.version` is `null`. Clients need the same
 * version (docs/playwright-mcp.md#playwright-server).
 */
export const DEFAULT_PLAYWRIGHT_VERSION = '1.65.0';

export interface PlaywrightServerOptions {
  settings: ServiceSettings;
  /** Where the Playwright versions are installed. */
  cacheRoot: string;
  /** `[bridge]` log. */
  logger: Logger;
  /** `[playwright-server]` log. */
  output: Logger;
  /** Replaces the install and the `run-server` command (tests). */
  launch?: Prepare;
  policy?: RestartPolicy;
}

/** Supervisor for `playwright run-server` in the configured version. */
export function playwrightServer(options: PlaywrightServerOptions): ChildProcessSupervisor {
  const { cacheRoot, output } = options;
  const prepare: Prepare = async ({ host, port, version }, signal) => {
    const cli = await ensurePlaywright({
      version,
      cacheRoot,
      run: runCommand(output),
      logger: output,
      signal,
    });
    return {
      command: process.execPath,
      args: [cli, 'run-server', '--port', String(port), '--host', host],
    };
  };
  return new ChildProcessSupervisor({
    name: 'playwright',
    settings: options.settings,
    defaultVersion: DEFAULT_PLAYWRIGHT_VERSION,
    prepare: options.launch ?? prepare,
    scheme: 'ws',
    logger: options.logger,
    output,
    ...(options.policy ? { policy: options.policy } : {}),
  });
}
