import type { HttpServer } from '../adapters/in/http/http-server.js';
import type { TcpListener } from '../adapters/in/tcp/tcp-listener.js';
import { ListenError } from '../adapters/shared/net/listen.js';
import type { BridgeStateControl, Shutdown } from '../application/ports/in/lifecycle.js';
import type { Logger } from '../application/ports/out/logger.js';
import type { Config } from '../domain/config/index.js';
import type { ChildService } from './services.js';

/** The ports the listeners are bound to. */
export interface Ports {
  readonly tcp: number;
  readonly http: number;
}

/**
 * Startup order (docs/operations.md#startup): the TCP listener first, so no speech is lost while
 * the rest starts, then HTTP. A failure is logged, and the TCP listener stops if HTTP fails.
 */
export async function startListeners(
  tcp: TcpListener,
  http: HttpServer,
  config: Config,
  logger: Logger,
): Promise<Ports> {
  const failed = (error: unknown) =>
    logger.error(error instanceof ListenError ? error.message : String(error));
  let tcpPort: number;
  try {
    tcpPort = await tcp.start(config.tcp);
  } catch (error) {
    failed(error);
    throw error;
  }
  try {
    return { tcp: tcpPort, http: await http.start(config.http) };
  } catch (error) {
    failed(error);
    await tcp.stop();
    throw error;
  }
}

/** Something the shutdown stops. */
interface Stoppable {
  stop(): Promise<void>;
}

/**
 * Starts the enabled child services in the background and stops the bridge. Child services
 * start in the background, so the API is usable during an install. The bridge is `ready` once
 * each enabled service is running or has failed (docs/operations.md#startup).
 */
export function runLifecycle(parts: {
  config: Config;
  status: BridgeStateControl;
  waits: Shutdown;
  logger: Logger;
  services: readonly ChildService[];
  /** Stopped in this order (docs/operations.md#shutdown). */
  stopOrder: readonly Stoppable[];
}): { stop(reason?: string): Promise<void> } {
  const { config, status, waits, logger, services, stopOrder } = parts;
  let stopping: Promise<void> | undefined;

  const ready = () => {
    if (stopping !== undefined) return;
    status.setState('ready');
    logger.info('ready');
  };
  const enabled = services
    .filter(({ section }) => config[section].enabled)
    .map(({ supervisor }) => supervisor);
  if (enabled.length === 0) ready();
  else void Promise.all(enabled.map((service) => service.start())).then(ready);

  async function shutdown(reason: string | undefined): Promise<void> {
    status.setState('stopping');
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

  return {
    stop(reason) {
      stopping ??= shutdown(reason);
      return stopping;
    },
  };
}
