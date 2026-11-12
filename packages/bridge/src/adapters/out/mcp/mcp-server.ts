import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { ServiceSettings } from '../../../application/ports/out/process-supervisor.js';
import type { RestartPolicy } from '../../../domain/service.js';
import { ChildProcessSupervisor, type Prepare } from '../process/child-process-supervisor.js';
import { runCommand } from '../process/run-command.js';

/**
 * The `@playwright/mcp` the bridge depends on (docs/playwright-mcp.md#mcp-version): its pinned
 * version and the path of its `cli.js`.
 */
export function bundledMcp(): { version: string; cli: string } {
  const manifest = createRequire(import.meta.url).resolve('@playwright/mcp/package.json');
  const { version } = JSON.parse(readFileSync(manifest, 'utf8')) as { version: string };
  return { version, cli: path.join(path.dirname(manifest), 'cli.js') };
}

export interface PlaywrightMcpOptions {
  settings: ServiceSettings;
  /** `[bridge]` log. */
  logger: Logger;
  /** `[playwright-mcp]` log. */
  output: Logger;
  /** Replaces the Chromium install and the MCP command (tests). */
  launch?: Prepare;
  policy?: RestartPolicy;
}

/**
 * Supervisor for Playwright MCP in HTTP mode, the bundled version. Each start first runs
 * `cli.js install-browser --no-shell chromium`, which installs the Chromium of MCP's own
 * Playwright and skips a build that is already there. `--allowed-hosts *` lets clients on other
 * machines in, `--isolated` gives each session a fresh profile in memory, and
 * `--browser chromium` uses that Chromium (headed by default).
 */
export function playwrightMcp(options: PlaywrightMcpOptions): ChildProcessSupervisor {
  const { output } = options;
  const { version, cli } = bundledMcp();
  const prepare: Prepare = async ({ host, port }, signal) => {
    output.info(`checking the Chromium of playwright mcp ${version}`);
    await runCommand(output)(process.execPath, [cli, 'install-browser', '--no-shell', 'chromium'], {
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
    defaultVersion: version,
    prepare: options.launch ?? prepare,
    scheme: 'http',
    path: '/mcp',
    logger: options.logger,
    output,
    ...(options.policy ? { policy: options.policy } : {}),
  });
}
