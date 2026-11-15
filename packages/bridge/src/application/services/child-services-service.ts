import {
  reachability,
  SERVICE_NAMES,
  type Reachability,
  type ServiceName,
} from '../../domain/child-service.js';
import type { Config } from '../../domain/config/index.js';
import type { ChildServices } from '../ports/in/child-services.js';
import type { Logger } from '../ports/out/logger.js';
import type { ProcessSupervisor } from '../ports/out/process-supervisor.js';

interface ChildServicesDeps {
  /** One supervisor per service. */
  supervisors: Readonly<Record<ServiceName, ProcessSupervisor>>;
  /**
   * The active configuration. A getter, not the `ReadConfig` use case: services depend on
   * out-ports and values, not on other driving ports.
   */
  config: () => Config;
  /** `[bridge]` log. */
  logger: Logger;
}

/** Runs the Playwright server and Playwright MCP as the configuration says. */
export class ChildServicesService implements ChildServices {
  constructor(private readonly deps: ChildServicesDeps) {}

  async startEnabled(): Promise<void> {
    const config = this.deps.config();
    const enabled = SERVICE_NAMES.filter((name) => config[name].enabled);
    await Promise.all(enabled.map((name) => this.supervisor(name).start()));
  }

  async stopAll(): Promise<void> {
    // Each one stops even if the one before it failed.
    const results = await Promise.allSettled(
      SERVICE_NAMES.map((name) => this.supervisor(name).stop()),
    );
    const errors = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : [],
    );
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'stopping the child services failed');
  }

  reachability(name: ServiceName): Reachability {
    return reachability(name, this.supervisor(name).status(), this.deps.config()[name].enabled);
  }

  private supervisor(name: ServiceName): ProcessSupervisor {
    return this.deps.supervisors[name];
  }
}
