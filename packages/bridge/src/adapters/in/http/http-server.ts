import http from 'node:http';
import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { GetStatus } from '../../../application/ports/in/get-status.js';
import type { ManageConfig } from '../../../application/ports/in/manage-config.js';
import type { ManageSessions } from '../../../application/ports/in/manage-sessions.js';
import type { SpeechUseCases } from '../../../application/ports/in/speech-use-cases.js';
import type { WaitForSpeech } from '../../../application/ports/in/wait-for-speech.js';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { Config } from '../../../domain/config/index.js';
import { AppError } from '../../../domain/errors.js';
import { listen } from '../../shared/net/listen.js';
import { describeListener } from '../../shared/net/reachable-urls.js';
import { sendError } from './errors.js';
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
}

/** How long `stop()` waits for open requests before it closes their connections. */
const CLOSE_GRACE_MS = 1000;

/** Bytes an SSE stream may hold for a client that stopped reading before it is closed. */
const SSE_MAX_BUFFERED_BYTES = 1024 * 1024;

/**
 * Driving adapter for the REST + SSE API (docs/http-api.md), on plain `node:http`.
 */
export class HttpServer {
  private server: http.Server | null = null;
  private settings: HttpSettings | null = null;
  /** Servers replaced by `restart()` that are still finishing their open requests. */
  private readonly retiring = new Set<Promise<void>>();
  private readonly router = new Router(API_PREFIX);
  private readonly sse: SseHub;

  constructor(private readonly deps: HttpServerDeps) {
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
    return this.bind(settings);
  }

  /**
   * Moves the API to new settings (`PUT /api/v1/config`) and resolves with the bound port.
   * The request that asked for it is served by the old server, so that one is not awaited: it
   * stops accepting connections and lets its open requests finish in the background.
   *
   * A new port is bound before the old server stops, so a port that is in use leaves everything
   * as it was. The same port on another host can't be bound while the old server holds it: then
   * the old server stops listening first, and starts again if the new address fails.
   */
  async restart(settings: HttpSettings): Promise<number> {
    const old = this.server;
    const previous = this.settings;
    if (!old || !previous) return this.start(settings);

    if (settings.port === 0 || settings.port !== previous.port) {
      const port = await this.bind(settings, old);
      this.retire(old);
      return port;
    }

    this.server = null;
    this.retire(old);
    try {
      return await this.bind(settings);
    } catch (error) {
      await this.bind(previous);
      throw error;
    }
  }

  /** Stops accepting connections, ends SSE streams and waits briefly for open requests. */
  async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    this.settings = null;
    if (server) this.retire(server);
    await Promise.all(this.retiring);
    if (server) this.deps.logger.info('stopped listening');
  }

  /** Listens on `settings` with a new server, which then replaces `replacing` (if any). */
  private async bind(
    settings: HttpSettings,
    replacing: http.Server | null = null,
  ): Promise<number> {
    const server = http.createServer((req, res) => {
      // Once this server is stopping, a response that finishes (a 503 for a pending wait, an
      // ended SSE stream, the answer to a PUT /config that moved the API) also ends its
      // keep-alive connection, so the server doesn't have to force it.
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
    const port = await listen(server, settings.host, settings.port);
    server.on('error', (error) => this.deps.logger.error(`HTTP server error: ${error.message}`));
    if (this.server !== replacing) {
      // Started or stopped meanwhile: this server is not needed.
      server.close();
      throw new Error('HTTP server changed while it was being restarted');
    }
    this.server = server;
    this.settings = { ...settings, port };
    // On 0.0.0.0, name the addresses clients can actually use (docs/operations.md#line-format).
    this.deps.logger.info(`listening on ${describeListener('http', settings.host, port)}`);
    return port;
  }

  /**
   * Stops `server` from accepting connections, ends the SSE streams (clients reconnect) and
   * closes its connections once their requests are done, forcing them after a grace period.
   */
  private retire(server: http.Server): void {
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    this.sse.closeAll();
    server.closeIdleConnections();
    const force = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE_MS);
    const done = closed.then(() => clearTimeout(force));
    this.retiring.add(done);
    void done.then(() => this.retiring.delete(done));
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    let path = '(invalid URL)';
    // Path only: the query can hold speech text (`wait?contains=`), which must stay off the
    // console (feedback loop, docs/operations.md#logging).
    res.on('finish', () => this.deps.logger.debug(`${method} ${path} → ${res.statusCode}`));
    try {
      const url = parseUrl(req.url);
      path = url.pathname;
      await this.router.find(method, url.pathname)({ req, res, url });
    } catch (error) {
      sendError(res, error, this.deps.logger);
    }
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
