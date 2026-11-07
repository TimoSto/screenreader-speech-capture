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
import { listen } from '../net/listen.js';
import { sendError } from './errors.js';
import { Router } from './router.js';
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

/**
 * Driving adapter for the REST + SSE API (docs/http-api.md), on plain `node:http`.
 */
export class HttpServer {
  private server: http.Server | null = null;
  private readonly streams = new Set<http.ServerResponse>();
  private readonly router = new Router();

  constructor(private readonly deps: HttpServerDeps) {
    speechRoutes(this.router, {
      ...deps,
      streams: this.streams,
      pingMs: deps.pingMs ?? 15_000,
    });
    statusRoutes(this.router, deps);
  }

  /** Starts listening. Resolves with the bound port (useful with port 0). */
  async start(settings: HttpSettings): Promise<number> {
    if (this.server) throw new Error('HTTP server is already running');
    const server = http.createServer((req, res) => void this.handle(req, res));
    const port = await listen(server, settings.host, settings.port);
    server.on('error', (error) => this.deps.logger.error(`HTTP server error: ${error.message}`));
    this.server = server;
    this.deps.logger.info(`listening on http://${settings.host}:${port}`);
    return port;
  }

  /** Stops accepting connections, ends SSE streams and waits briefly for open requests. */
  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    this.server = null;
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    for (const res of this.streams) res.end();
    server.closeIdleConnections();
    const force = setTimeout(() => server.closeAllConnections(), CLOSE_GRACE_MS);
    await closed;
    clearTimeout(force);
    this.deps.logger.info('stopped listening');
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://bridge');
    // Path only: the query can hold speech text (`wait?contains=`), which must stay off the
    // console (feedback loop, docs/operations.md#logging).
    res.on('finish', () => this.deps.logger.debug(`${method} ${url.pathname} → ${res.statusCode}`));
    try {
      await this.router.find(method, url.pathname)({ req, res, url });
    } catch (error) {
      sendError(res, error, this.deps.logger);
    }
  }
}
