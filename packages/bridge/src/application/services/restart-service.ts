import { AppError } from '../../domain/errors.js';
import type { RestartBridge } from '../ports/in/restart.js';
import type { Logger } from '../ports/out/logger.js';

interface RestartServiceDeps {
  /** Starts the restart. Absent when this bridge can't restart itself. */
  trigger?: (() => void) | undefined;
  logger: Logger;
}

export class RestartService implements RestartBridge {
  private requested = false;

  constructor(private readonly deps: RestartServiceDeps) {}

  canRestart(): boolean {
    return this.deps.trigger !== undefined;
  }

  restart(): void {
    const { trigger, logger } = this.deps;
    if (trigger === undefined) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'This bridge cannot restart itself, restart it by hand',
      );
    }
    // A second request while the first one is stopping the bridge changes nothing.
    if (this.requested) return;
    this.requested = true;
    logger.info('restart requested');
    trigger();
  }
}
