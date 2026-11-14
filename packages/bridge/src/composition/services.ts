import type { BridgeLog } from '../adapters/out/log/bridge-log.js';
import { playwrightMcp } from '../adapters/out/mcp/playwright-mcp.js';
import { defaultPlaywrightDir } from '../adapters/out/platform/paths.js';
import { playwrightServer } from '../adapters/out/playwright/playwright-server.js';
import type {
  ProcessSupervisor,
  ServiceSettings,
} from '../application/ports/out/process-supervisor.js';
import type { Config } from '../domain/config/index.js';
import type { TestSeams } from './test-seams.js';

/** The Playwright server listens on the same interface as the HTTP API (`--host`). */
const playwrightSettings = (config: Config): ServiceSettings => ({
  host: config.http.host,
  port: config.playwright.port,
  version: config.playwright.version,
});

/** Playwright MCP listens on the same interface as the HTTP API (`--host`), bundled version. */
const mcpSettings = (config: Config): ServiceSettings => ({
  host: config.http.host,
  port: config.mcp.port,
  version: null,
});

/** A child service, the config section it follows and its settings from the config. */
export interface ChildService {
  readonly section: 'playwright' | 'mcp';
  readonly supervisor: ProcessSupervisor;
  readonly settingsOf: (config: Config) => ServiceSettings;
}

export type ServiceOptions = Pick<TestSeams, 'playwrightDir' | 'playwrightLaunch' | 'mcpLaunch'>;

/** The supervised child services, not started yet. */
export function createServices(config: Config, options: ServiceOptions, log: BridgeLog) {
  const logger = log.for('bridge');
  const playwright = playwrightServer({
    settings: playwrightSettings(config),
    cacheRoot: options.playwrightDir ?? defaultPlaywrightDir(),
    logger,
    output: log.for('playwright-server'),
    ...(options.playwrightLaunch ? { launch: options.playwrightLaunch } : {}),
  });
  const mcp = playwrightMcp({
    settings: mcpSettings(config),
    logger,
    output: log.for('playwright-mcp'),
    ...(options.mcpLaunch ? { launch: options.mcpLaunch } : {}),
  });
  const all: ChildService[] = [
    { section: 'playwright', supervisor: playwright, settingsOf: playwrightSettings },
    { section: 'mcp', supervisor: mcp, settingsOf: mcpSettings },
  ];
  return { playwright, mcp, all };
}
