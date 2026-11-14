import type {
  BridgeLifecycle,
  BridgeStateControl,
  Shutdown,
  Stoppable,
} from '../ports/in/lifecycle.js';
import type { Logger } from '../ports/out/logger.js';

export interface BridgeLifecycleDeps {
  state: BridgeStateControl;
  /** Pending waits, which answer before the HTTP server closes their connections. */
  waits: Shutdown;
  /** Starts the enabled child services; resolves once each is running or has failed. */
  startServices: () => Promise<void>;
  /** Stopped in this order (docs/usage/operations.md#shutdown). */
  stopOrder: readonly Stoppable[];
  /** `[bridge]` log. */
  logger: Logger;
}

/** The bridge's state from `starting` over `ready` to `stopping`, and the shutdown order. */
export class BridgeLifecycleService implements BridgeLifecycle {
  private stopping: Promise<void> | undefined;

  constructor(private readonly deps: BridgeLifecycleDeps) {}

  start(): void {
    void this.deps.startServices().then(() => {
      if (this.stopping !== undefined) return;
      this.deps.state.setState('ready');
      this.deps.logger.info('ready');
    });
  }

  stop(reason?: string): Promise<void> {
    this.stopping ??= this.shutdown(reason);
    return this.stopping;
  }

  private async shutdown(reason: string | undefined): Promise<void> {
    const { state, waits, stopOrder, logger } = this.deps;
    state.setState('stopping');
    logger.info(reason === undefined ? 'stopping' : `stopping (${reason})`);
    // Pending waits answer 503 before the HTTP server closes their connections.
    waits.shutdown();
    // Each part stops even if the one before it failed. The child services go last; their whole
    // process tree is killed.
    const errors: unknown[] = [];
    for (const part of stopOrder) {
      try {
        await part.stop();
      } catch (error) {
        logger.error(`shutdown failed: ${String(error)}`);
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'shutdown failed');
    logger.info('stopped');
  }
}
