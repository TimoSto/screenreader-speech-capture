import type { ServiceStatus } from '../../../domain/service.js';

/** Where and which version a child service runs. `version: null` = the bundled default. */
export interface ServiceSettings {
  readonly host: string;
  readonly port: number;
  readonly version: string | null;
}

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
