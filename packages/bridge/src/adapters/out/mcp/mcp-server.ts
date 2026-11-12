import type { Logger } from '../../../application/ports/out/logger.js';
import type { ServiceSettings } from '../../../application/ports/out/process-supervisor.js';
import type { RestartPolicy } from '../../../domain/service.js';
import { ChildProcessSupervisor, type Prepare } from '../process/child-process-supervisor.js';
import { runCommand } from '../process/run-command.js';
import { ensurePlaywrightMcp } from './mcp-installer.js';

/** `@playwright/mcp` version when `mcp.version` is `null` (docs/playwright-mcp.md#mcp-version). */
export const DEFAULT_MCP_VERSION = '0.0.85';

export interface PlaywrightMcpOptions {
  settings: ServiceSettings;
  /** Where the MCP versions are installed. */
  cacheRoot: string;
  /** `[bridge]` log. */
  logger: Logger;
  /** `[playwright-mcp]` log. */
  output: Logger;
  /** Replaces the install and the MCP command (tests). */
  launch?: Prepare;
  policy?: RestartPolicy;
}

/**
 * Supervisor for Playwright MCP in HTTP mode, in the configured version. `--allowed-hosts *`
 * lets clients on other machines in, `--isolated` gives each session a fresh profile in memory,
 * and `--browser chromium` uses the Chromium the installer fetched (headed by default).
 */
export function playwrightMcp(options: PlaywrightMcpOptions): ChildProcessSupervisor {
  const { cacheRoot, output } = options;
  const prepare: Prepare = async ({ host, port, version }, signal) => {
    const cli = await ensurePlaywrightMcp({
      version,
      cacheRoot,
      run: runCommand(output),
      logger: output,
      signal,
    });
    return {
      command: process.execPath,
      // No shell, so `*` reaches MCP as it is.
      args: [
        cli,
        '--port',
        String(port),
        '--host',
        host,
        '--allowed-hosts',
        '*',
        '--browser',
        'chromium',
        '--isolated',
      ],
    };
  };
  return new ChildProcessSupervisor({
    name: 'mcp',
    settings: options.settings,
    defaultVersion: DEFAULT_MCP_VERSION,
    prepare: options.launch ?? prepare,
    scheme: 'http',
    path: '/mcp',
    logger: options.logger,
    output,
    ...(options.policy ? { policy: options.policy } : {}),
  });
}
