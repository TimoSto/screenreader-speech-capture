import type { Reachability, ServiceName } from '../../../domain/child-service.js';
import type { Config } from '../../../domain/config/index.js';

/**
 * The supervised child services, run as the configuration says
 * (docs/usage/operations.md#child-service-crashes). Only the composition root drives it: at
 * startup, on a config change, at shutdown, and for the HTTP proxy's targets.
 */
export interface ChildServices {
  /** Starts the enabled ones. Resolves once each is running or has failed; never rejects. */
  startEnabled(): Promise<void>;
  /**
   * Applies a config change to the services whose section changed: new settings, then a restart
   * if enabled (in the background: an install can take minutes) or a stop if disabled. A
   * failure is logged and shows in the status; it doesn't reject.
   */
  apply(next: Config, previous: Config): Promise<void>;
  /** Stops all of them and their process trees (shutdown). Rejects if one fails to stop. */
  stopAll(): Promise<void>;
  /** Where a request to the service goes: its port while it runs, otherwise why not. */
  reachability(name: ServiceName): Reachability;
}
