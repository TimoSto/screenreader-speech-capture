import type { Config } from '../../domain/config.js';
import { AppError } from '../../domain/errors.js';
import type { ServiceName, ServiceStatus } from '../../domain/service.js';
import type { ManageServices } from '../ports/in/manage-services.js';
import type { ProcessSupervisor } from '../ports/out/process-supervisor.js';

export interface ServicesServiceDeps {
  supervisors: ReadonlyMap<ServiceName, ProcessSupervisor>;
  /** The active configuration, for the `enabled` switches. */
  config: () => Config;
}

/** Starts, stops and restarts the child services by name. */
export class ServicesService implements ManageServices {
  constructor(private readonly deps: ServicesServiceDeps) {}

  async start(name: string): Promise<ServiceStatus> {
    const supervisor = this.enabled(name);
    await supervisor.start();
    return supervisor.status();
  }

  async stop(name: string): Promise<ServiceStatus> {
    const supervisor = this.find(name);
    await supervisor.stop();
    return supervisor.status();
  }

  async restart(name: string): Promise<ServiceStatus> {
    const supervisor = this.enabled(name);
    await supervisor.restart();
    return supervisor.status();
  }

  private find(name: string): ProcessSupervisor {
    const supervisor = this.deps.supervisors.get(name as ServiceName);
    if (supervisor === undefined) throw new AppError('NOT_FOUND', `Unknown service "${name}"`);
    return supervisor;
  }

  private enabled(name: string): ProcessSupervisor {
    const supervisor = this.find(name);
    if (!this.deps.config()[name as ServiceName].enabled) {
      throw new AppError('SERVICE_UNAVAILABLE', `${name} is disabled (${name}.enabled is false)`);
    }
    return supervisor;
  }
}
