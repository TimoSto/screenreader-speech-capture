import http from 'node:http';
import type { Duplex } from 'node:stream';
import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { GetStatus } from '../../../application/ports/in/get-status.js';
import type { ManageConfig } from '../../../application/ports/in/manage-config.js';
import type { ManageSessions } from '../../../application/ports/in/manage-sessions.js';
import type { SpeechUseCases } from '../../../application/ports/in/speech.js';
import type { WaitForSpeech } from '../../../application/ports/in/wait-for-speech.js';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { Config } from '../../../domain/config/index.js';
import { AppError } from '../../../domain/errors.js';
import { checkAccess } from './access.js';
import { listen } from '../../shared/net/listen.js';
import { describeListener } from '../../shared/net/reachable-urls.js';
import { sendError, sendSocketError } from './errors.js';
import { type ProxyRoute, ServiceProxy } from './proxy/service-proxy.js';
import { Router } from './router.js';
import { configRoutes } from './routes/config-routes.js';
import { sessionRoutes } from './routes/session-routes.js';
import { speechRoutes } from './routes/speech-routes.js';
import { statusRoutes } from './routes/status-routes.js';
import { SseHub } from './sse/sse-hub.js';

export type HttpSettings = Config['http'];

/** The driving ports the API calls, plus the logger. */
export interface HttpServerDeps {
  speech: SpeechUseCases;
  waits: WaitForSpeech;
  status: GetStatus;
  config: ManageConfig;
  sessions: ManageSessions;
  logger: Logger;
  /** Interval of the SSE `: ping` comment. Default 15 s. */
  pingMs?: number;
  /** This machine's names, accepted as `Host` like `localhost`. Default: none. */
  hostnames?: readonly string[];
  /**
   * Child services passed through on their own paths (docs/usage/playwright-mcp.md). Default: none.
   */
  proxies?: readonly ProxyRoute[];
}

/** How long `stop()` waits for open requests before it closes their connections. */
const CLOSE_GRACE_MS = 1000;

/** Bytes an SSE stream may hold for a client that stopped reading before it is closed. */
const SSE_MAX_BUFFERED_BYTES = 1024 * 1024;

/**
 * Driving adapter for the REST + SSE API (docs/usage/http-api.md), on plain `node:http`. Its
 * address is set at start; a new one takes effect on the next start of the bridge.
 */
export class HttpServer {
  private server: http.Server | null = null;
  private allowedHosts: readonly string[] = [];
  private readonly router = new Router(API_PREFIX);
  private readonly sse: SseHub;
  private readonly proxy: ServiceProxy;

  constructor(private readonly deps: HttpServerDeps) {
    this.proxy = new ServiceProxy(deps.proxies ?? [], deps.logger);
    this.sse = new SseHub({
      pingMs: deps.pingMs ?? 15_000,
      maxBufferedBytes: SSE_MAX_BUFFERED_BYTES,
    });
    speechRoutes(this.router, { ...deps, sse: this.sse });
    statusRoutes(this.router, deps);
    configRoutes(this.router, deps);
    sessionRoutes(this.router, deps);
  }

  /** Starts listening. Resolves with the bound port (useful with port 0). */
  async start(settings: HttpSettings): Promise<number> {
    if (this.server) throw new Error('HTTP server is already running');
    const server = http.createServer((req, res) => {
      // Once the server is stopping, a response that finishes (a 503 for a pending wait, an
      // ended SSE stream) also ends its keep-alive connection, so it doesn't have to be forced.
      res.once('finish', () => {
        if (this.server !== server) req.socket.end();
      });
      // `handle` answers every error itself. This catch is the last line of defence: a rejection
      // here would be unhandled and end the process.
      this.handle(req, res).catch((error: unknown) => {
        this.deps.logger.error(`request failed: ${String(error)}`);
        res.destroy();
      });
    });
    server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
      this.upgrade(req, socket, head);
    });
    const port = await listen(server, settings.host, settings.port);
    server.on('error', (error) => this.deps.logger.error(`HTTP server error: ${error.message}`));
    this.server = server;
    this.allowedHosts = settings.allowedHosts;
    // On 0.0.0.0, name the addresses clients can actually use
    // (docs/usage/operations.md#line-format).
    this.deps.logger.info(`listening on ${describeListener('http', settings.host, port)}`);
    for (const route of this.deps.proxies ?? []) {
      const at = describeListener(route.scheme, settings.host, port, route.path);
      this.deps.logger.info(`${route.name} at ${at}`);
    }
    return port;
  }

  /** `http.allowedHosts`, for the next request (`PUT /api/v1/config`). */
  setAllowedHosts(hosts: readonly string[]): void {
    this.allowedHosts = hosts;
  }

  /**
   * Stops accepting connections, ends the SSE streams and waits briefly for open requests before
   * it closes their connections.
   */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    this.sse.close();
    // Upgraded sockets still count as the server's connections, so `close` waits for them.
    this.proxy.closeTunnels();
    server.closeIdleConnections();
    const force = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE_MS);
    await closed;
    clearTimeout(force);
    this.deps.logger.info('stopped listening');
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    let path = '(invalid URL)';
    // Path only: the query can hold speech text (`wait?contains=`), which must stay off the
    // console (feedback loop, docs/usage/operations.md#logging).
    res.on('finish', () => this.deps.logger.debug(`${method} ${path} → ${res.statusCode}`));
    try {
      const url = parseUrl(req.url);
      path = url.pathname;
      const route = this.proxy.match(url.pathname);
      this.checkAccess(req, route !== undefined);
      if (route) this.proxy.forward(route, req, res, url);
      else await this.router.find(method, url.pathname)({ req, res, url });
    } catch (error) {
      sendError(res, error, this.deps.logger);
    }
  }

  /**
   * A WebSocket handshake: only the services' `ws` paths take one (the Playwright server). Every
   * refusal is answered on the socket in the API's error format.
   */
  private upgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): void {
    socket.on('error', (error) => this.deps.logger.debug(`upgrade: ${error.message}`));
    try {
      if (this.server === null) {
        throw new AppError('SERVICE_UNAVAILABLE', 'The bridge is shutting down');
      }
      const url = parseUrl(req.url);
      const route = this.proxy.match(url.pathname);
      if (route?.scheme !== 'ws') {
        throw new AppError('NOT_FOUND', `No WebSocket endpoint at ${url.pathname}`);
      }
      this.checkAccess(req, true);
      this.deps.logger.debug(`upgrade ${url.pathname} → ${route.name}`);
      this.proxy.upgrade(route, req, socket, head, url);
    } catch (error) {
      sendSocketError(socket, error, this.deps.logger);
    }
  }

  /**
   * Host and origin rules (docs/usage/security.md#host-and-origin). The services refuse a foreign
   * origin for every method: a page could open a WebSocket or read an event stream.
   */
  private checkAccess(req: http.IncomingMessage, proxied: boolean): void {
    checkAccess(
      req,
      { allowedHosts: this.allowedHosts, ownHostnames: this.deps.hostnames ?? [] },
      { strictOrigin: proxied },
    );
  }
}

/** The request target as a URL. An absolute-form target such as `http://[` doesn't parse. */
function parseUrl(target: string | undefined): URL {
  try {
    return new URL(target ?? '/', 'http://bridge');
  } catch {
    throw new AppError('INVALID_REQUEST', 'The request URL is not valid');
  }
}
