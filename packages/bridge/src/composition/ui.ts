import { existsSync } from 'node:fs';
import type http from 'node:http';
import type { UiHandler } from '../adapters/in/http/ui-handler.js';
import { hostPort, isLoopbackAddress, isWildcard } from '../adapters/shared/net/reachable-urls.js';
import type { Logger } from '../application/ports/out/logger.js';
import { AppError } from '../domain/errors.js';

/** The environment variable the UI's BFF reads the bridge's address from. */
export const BRIDGE_API_URL_ENV = 'SR_BRIDGE_API_URL';

/** The header adapter-node reads the request's protocol from (`PROTOCOL_HEADER`). */
const PROTOCOL_HEADER = 'x-sr-bridge-protocol';

/**
 * The header that tells the UI its page is opened from the bridge's own machine, where the screen
 * reader would read the live log and feed it back (docs/usage/web-ui.md#accessibility-of-the-ui-itself).
 * Set (`1`) or removed on every request, so a client can't send it.
 */
export const LOCAL_HEADER = 'x-sr-bridge-local';

/** The `adapter-node` handler of the SvelteKit app (`packages/ui`, copied to `dist/ui`). */
type NodeHandler = (req: http.IncomingMessage, res: http.ServerResponse, next: () => void) => void;

/**
 * The web UI inside the bridge process (docs/implementation/architecture.md#the-web-ui-a-sveltekit-bff).
 * Requests wait until {@link mount} has loaded the SvelteKit server.
 */
export interface UiMount {
  readonly handler: UiHandler;
  /**
   * Points the BFF at the bridge's own HTTP API and loads the SvelteKit server. SvelteKit reads
   * its environment when it loads, so this comes after the port is known. A failure is logged;
   * the API keeps working and the UI answers 503.
   */
  mount(apiUrl: string): Promise<void>;
}

/**
 * The UI shipped in `dir` (`handler.js` of the `adapter-node` build). `undefined` when there is
 * none: the bridge runs from source, or the package was built without the UI.
 */
export function createUiMount(dir: URL, logger: Logger): UiMount | undefined {
  const file = new URL('handler.js', dir);
  if (!existsSync(file)) {
    logger.debug(`no web UI at ${file.pathname}`);
    return undefined;
  }
  let settle!: { resolve(handler: NodeHandler): void; reject(error: unknown): void };
  const loaded = new Promise<NodeHandler>((resolve, reject) => {
    settle = { resolve, reject };
  });
  // A rejection nobody awaits yet (no request so far) is not an unhandled one.
  loaded.catch(() => undefined);

  return {
    handler: async (req, res) => {
      // The app lives under /ui (its SvelteKit base path); the bare address leads there.
      if (new URL(req.url ?? '/', 'http://localhost').pathname === '/') {
        res.writeHead(302, { location: '/ui/' }).end();
        return;
      }
      let handler: NodeHandler;
      try {
        handler = await loaded;
      } catch {
        throw new AppError('SERVICE_UNAVAILABLE', 'The web UI failed to start');
      }
      // The bridge only speaks plain HTTP. adapter-node assumes https unless told otherwise, which
      // makes SvelteKit's CSRF check reject every same-origin body-less DELETE/POST (403).
      req.headers[PROTOCOL_HEADER] = 'http';
      if (isLoopbackAddress(req.socket?.remoteAddress)) req.headers[LOCAL_HEADER] = '1';
      else delete req.headers[LOCAL_HEADER];
      handler(req, res, () => {
        res.statusCode = 404;
        res.end();
      });
    },
    async mount(apiUrl) {
      try {
        process.env[BRIDGE_API_URL_ENV] = apiUrl;
        process.env.PROTOCOL_HEADER = PROTOCOL_HEADER;
        const module = (await import(file.href)) as { handler?: unknown };
        if (typeof module.handler !== 'function') throw new Error('handler.js has no `handler`');
        settle.resolve(module.handler as NodeHandler);
        logger.debug(`web UI loaded from ${file.pathname}`);
      } catch (error) {
        logger.error(
          `web UI failed to start: ${error instanceof Error ? error.message : String(error)}`,
        );
        settle.reject(error);
      }
    },
  };
}

/** The shipped UI: `ui/` next to the bundled `cli.mjs` (`dist/ui`). */
export function shippedUiDir(): URL {
  return new URL('./ui/', import.meta.url);
}

/**
 * Where the BFF reaches the bridge's HTTP API: over loopback, whatever address it listens on.
 */
export function bridgeApiUrl(host: string, port: number): string {
  const loopback = host === '::' ? '::1' : isWildcard(host) ? '127.0.0.1' : host;
  return `http://${hostPort(loopback, port)}`;
}
