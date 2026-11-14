import { PLAYWRIGHT_MCP_PATH, PLAYWRIGHT_PATH } from '@screenreader-speech-capture/shared';
import { CHILD_HOST, type ProxyRoute } from '../adapters/in/http/proxy/service-proxy.js';
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

// The child services listen on loopback only. Clients reach them through the bridge's HTTP port,
// which checks Host and Origin for them like for the API (docs/decisions.md#the-bridge-is-the-single-ingress).

/** The Playwright server: the configured version. */
const playwrightSettings = (config: Config): ServiceSettings => ({
  host: CHILD_HOST,
  port: config.playwright.port,
  version: config.playwright.version,
});

/** Playwright MCP: the bundled version. */
const mcpSettings = (config: Config): ServiceSettings => ({
  host: CHILD_HOST,
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

/**
 * The supervised child services, not started yet, and their routes through the bridge's HTTP
 * port. `current` is the configuration in use, for whether a service is enabled.
 */
export function createServices(
  config: Config,
  current: () => Config,
  options: ServiceOptions,
  log: BridgeLog,
) {
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
  const target = (section: ChildService['section'], supervisor: ProcessSupervisor) => () => {
    const { state, port } = supervisor.status();
    if (state === 'running') return { port };
    const name = NAMES[section];
    if (!current()[section].enabled) return { unavailable: `${name} is disabled` };
    return { unavailable: `${name} is not running (state: ${state})` };
  };
  const proxies: ProxyRoute[] = [
    {
      name: NAMES.playwright,
      path: PLAYWRIGHT_PATH,
      upstreamPath: '/',
      scheme: 'ws',
      target: target('playwright', playwright),
    },
    {
      name: NAMES.mcp,
      path: PLAYWRIGHT_MCP_PATH,
      upstreamPath: '/mcp',
      scheme: 'http',
      target: target('mcp', mcp),
    },
  ];
  return { playwright, mcp, all, proxies };
}

/** How the services are named in log lines and errors. */
const NAMES = { playwright: 'Playwright server', mcp: 'Playwright MCP' } as const;
