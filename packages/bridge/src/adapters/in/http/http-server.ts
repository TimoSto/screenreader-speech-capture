import http from 'node:http';
import type { AddMarker } from '../../../application/ports/in/add-marker.js';
import type { ClearSpeech } from '../../../application/ports/in/clear-speech.js';
import type { GetStatus } from '../../../application/ports/in/get-status.js';
import type { ReadConfig } from '../../../application/ports/in/manage-config.js';
import type { QuerySpeech } from '../../../application/ports/in/query-speech.js';
import type { WaitForSpeech } from '../../../application/ports/in/wait-for-speech.js';
import type { WatchSpeech } from '../../../application/ports/in/watch-speech.js';
import type { Logger } from '../../../application/ports/out/logger.js';
import type { Config } from '../../../domain/config.js';
import { AppError } from '../../../domain/errors.js';
import { listen } from '../net/listen.js';
import { sendError } from './errors.js';
import { Router } from './router.js';
import { SseHub } from './sse.js';
import { speechRoutes } from './speech-routes.js';
import { statusRoutes } from './status-routes.js';

export type HttpSettings = Config['http'];

/** The driving ports the API calls, plus the logger. */
export interface HttpServerDeps {
  speech: QuerySpeech & ClearSpeech & AddMarker & WatchSpeech;
  waits: WaitForSpeech;
  status: GetStatus;
  config: ReadConfig;
  logger: Logger;
  /** Interval of the SSE `: ping` comment. Default 15 s. */
  pingMs?: number;
}

/** How long `stop()` waits for open requests before it closes their connections. */
const CLOSE_GRACE_MS = 1000;

/** Bytes an SSE stream may hold for a client that stopped reading before it is closed. */
const SSE_MAX_BUFFERED_BYTES = 1024 * 1024;

/** `host:port` for a URL, with an IPv6 host in brackets. */
function hostPort(host: string, port: number): string {
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

/**
 * Driving adapter for the REST + SSE API (docs/http-api.md), on plain `node:http`.
 */
export class HttpServer {
  private server: http.Server | null = null;
  private readonly router = new Router();
  private readonly sse: SseHub;

  constructor(private readonly deps: HttpServerDeps) {
    this.sse = new SseHub({
      pingMs: deps.pingMs ?? 15_000,
      maxBufferedBytes: SSE_MAX_BUFFERED_BYTES,
    });
    speechRoutes(this.router, { ...deps, sse: this.sse });
    statusRoutes(this.router, deps);
  }

  /** Starts listening. Resolves with the bound port (useful with port 0). */
  async start(settings: HttpSettings): Promise<number> {
    if (this.server) throw new Error('HTTP server is already running');
    const server = http.createServer((req, res) => {
      // Once `stop()` has begun, a response that finishes (a 503 for a pending wait, an ended
      // SSE stream) also ends its keep-alive connection, so `stop()` doesn't have to force it.
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
    this.server = server;
    this.deps.logger.info(`listening on http://${hostPort(settings.host, port)}`);
    return port;
  }

  /** Stops accepting connections, ends SSE streams and waits briefly for open requests. */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    this.sse.closeAll();
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
