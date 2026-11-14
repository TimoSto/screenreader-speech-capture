import type { ServiceSettings, ServiceStatus } from '../../../domain/child-service.js';

export type { ServiceSettings };

/**
 * One supervised child service (docs/operations.md#child-service-crashes): installs it if
 * needed, runs it, restarts it after crashes and kills its whole process tree on stop.
 */
export interface ProcessSupervisor {
  /**
   * Starts the service (no-op while it is starting or running). Resolves once it is `running`,
   * or `failed` after too many crashes in a row. Never rejects.
   */
  start(): Promise<void>;
  /** Stops it and its child processes. Resolves when they have exited. */
  stop(): Promise<void>;
  /** Stop, then start, with a fresh crash count (after a config change). */
  restart(): Promise<void>;
  /** Settings for the next start. A running service keeps its settings until it restarts. */
  reconfigure(settings: ServiceSettings): void;
  status(): ServiceStatus;
}
