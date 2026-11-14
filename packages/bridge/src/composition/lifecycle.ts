import type { HttpServer } from '../adapters/in/http/http-server.js';
import type { TcpListener } from '../adapters/in/tcp/tcp-listener.js';
import { ListenError } from '../adapters/shared/net/listen.js';
import type { Logger } from '../application/ports/out/logger.js';
import type { Config } from '../domain/config/index.js';

/** The ports the listeners are bound to. */
export interface Ports {
  readonly tcp: number;
  readonly http: number;
}

/**
 * Startup order (docs/usage/operations.md#startup): the TCP listener first, so no speech is lost
 * while the rest starts, then HTTP. A failure is logged, and the TCP listener stops if HTTP fails.
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
