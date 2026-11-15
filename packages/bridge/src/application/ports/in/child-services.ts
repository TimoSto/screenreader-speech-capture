import type { Reachability, ServiceName } from '../../../domain/child-service.js';

/**
 * The supervised child services, run as the configuration says
 * (docs/usage/operations.md#child-service-crashes). Only the composition root drives it: at
 * startup, at shutdown, and for the HTTP proxy's targets.
 */
export interface ChildServices {
  /** Starts the enabled ones. Resolves once each is running or has failed; never rejects. */
  startEnabled(): Promise<void>;
  /** Stops all of them and their process trees (shutdown). Rejects if one fails to stop. */
  stopAll(): Promise<void>;
  /** Where a request to the service goes: its port while it runs, otherwise why not. */
  reachability(name: ServiceName): Reachability;
}
