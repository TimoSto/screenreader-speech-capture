import type { BridgeLog } from '../adapters/out/log/bridge-log.js';
import { playwrightMcp } from '../adapters/out/mcp/playwright-mcp.js';
import { defaultPlaywrightDir } from '../adapters/out/platform/paths.js';
import { playwrightServer } from '../adapters/out/playwright/playwright-server.js';
import type { ProcessSupervisor } from '../application/ports/out/process-supervisor.js';
import { serviceSettings, type ServiceName } from '../domain/child-service.js';
import type { Config } from '../domain/config/index.js';
import type { TestSeams } from './test-seams.js';

export type ServiceOptions = Pick<TestSeams, 'playwrightDir' | 'playwrightLaunch' | 'mcpLaunch'>;

/** One supervisor per child service, not started yet (`ChildServicesService` runs them). */
export function createSupervisors(
  config: Config,
  options: ServiceOptions,
  log: BridgeLog,
): Readonly<Record<ServiceName, ProcessSupervisor>> {
  const logger = log.for('bridge');
  const playwright = playwrightServer({
    settings: serviceSettings('playwright', config),
    cacheRoot: options.playwrightDir ?? defaultPlaywrightDir(),
    logger,
    output: log.for('playwright-server'),
    ...(options.playwrightLaunch ? { launch: options.playwrightLaunch } : {}),
  });
  const mcp = playwrightMcp({
    settings: serviceSettings('mcp', config),
    logger,
    output: log.for('playwright-mcp'),
    ...(options.mcpLaunch ? { launch: options.mcpLaunch } : {}),
  });
  return { playwright, mcp };
}
