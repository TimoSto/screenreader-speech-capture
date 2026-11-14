import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';
import type { Logger } from '../../../../application/ports/out/logger.js';
import { AppError } from '../../../../domain/errors.js';
import { sendError, sendSocketError } from '../errors.js';

/** Where the child services listen: loopback only, the bridge is their way in. */
export const CHILD_HOST = '127.0.0.1';

/** A child service the bridge passes through on its HTTP port (docs/playwright-mcp.md). */
export interface ProxyRoute {
  /** For log lines and errors, for example `playwright`. */
  readonly name: string;
  /** The path on the bridge, for example `/playwright`. Matched exactly; the query is kept. */
  readonly path: string;
  /** The path on the child service the request goes to, for example `/mcp`. */
  readonly upstreamPath: string;
  /** `ws`: clients connect with a WebSocket (the Playwright server); `http`: plain requests. */
  readonly scheme: 'ws' | 'http';
  /** The child's port on {@link CHILD_HOST} while it runs, otherwise why it can't be reached. */
  target(): { port: number } | { unavailable: string };
}

/** Headers that belong to one connection and are not passed on (RFC 9110, 7.6.1). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

/**
 * Passes requests on to the child services (docs/security.md#host-and-origin: the access check
 * runs before, in `HttpServer`). Plain requests are streamed both ways, so MCP's event streams
 * work; a WebSocket upgrade becomes a tunnel between the two sockets.
 */
export class ServiceProxy {
  /** Open WebSocket tunnels, both sockets of each. `closeTunnels()` ends them on shutdown. */
  private readonly tunnels = new Set<Duplex>();

  constructor(
    private readonly routes: readonly ProxyRoute[],
    private readonly logger: Logger,
  ) {}

  /** The route for a request path, `undefined` if it isn't one of the services. */
  match(pathname: string): ProxyRoute | undefined {
    return this.routes.find((route) => route.path === pathname);
  }

  /**
   * Sends the request to the service and its answer back. Throws `SERVICE_UNAVAILABLE` before
   * anything is sent if the service isn't running; later failures are answered here.
   */
  forward(route: ProxyRoute, req: http.IncomingMessage, res: http.ServerResponse, url: URL): void {
    const port = this.portOf(route);
    const headers: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (!HOP_BY_HOP.has(name) && name !== 'host' && name !== 'origin') headers[name] = value;
    }
    headers.host = `${CHILD_HOST}:${port}`;

    const upstream = http.request({
      host: CHILD_HOST,
      port,
      method: req.method,
      path: route.upstreamPath + url.search,
      headers,
    });
    upstream.on('response', (answer) => {
      const back: http.OutgoingHttpHeaders = {};
      for (const [name, value] of Object.entries(answer.headers)) {
        if (!HOP_BY_HOP.has(name)) back[name] = value;
      }
      res.writeHead(answer.statusCode ?? 502, back);
      // Event streams (MCP) must reach the client at once, not when a buffer is full.
      res.flushHeaders();
      answer.pipe(res);
    });
    upstream.on('error', (error) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendError(res, this.unreachable(route, error), this.logger);
    });
    // The client went away (or the bridge stops): end the request to the service too.
    res.on('close', () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  }

  /**
   * Turns a WebSocket upgrade into a tunnel to the service. Answers on `socket` itself when the
   * service isn't running or can't be reached.
   */
  upgrade(
    route: ProxyRoute,
    req: http.IncomingMessage,
    socket: Duplex,
    head: Buffer,
    url: URL,
  ): void {
    const port = this.portOf(route);
    const lines = [`${req.method ?? 'GET'} ${route.upstreamPath}${url.search} HTTP/1.1`];
    const raw = req.rawHeaders;
    for (let i = 0; i < raw.length; i += 2) {
      const name = raw[i]!.toLowerCase();
      // `upgrade` and `connection` stay: they are what makes this a WebSocket handshake.
      if (name !== 'host' && name !== 'origin') lines.push(`${raw[i]}: ${raw[i + 1]}`);
    }
    lines.push(`Host: ${CHILD_HOST}:${port}`);

    const upstream = net.connect(port, CHILD_HOST);
    let connected = false;
    upstream.once('connect', () => {
      connected = true;
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      this.track(socket, upstream);
      socket.pipe(upstream).pipe(socket);
    });
    upstream.on('error', (error) => {
      if (connected) {
        socket.destroy();
        return;
      }
      sendSocketError(socket, this.unreachable(route, error), this.logger);
    });
    socket.on('error', () => upstream.destroy());
  }

  /** Ends every open WebSocket tunnel (shutdown). */
  closeTunnels(): void {
    for (const socket of this.tunnels) socket.destroy();
  }

  private portOf(route: ProxyRoute): number {
    const target = route.target();
    if ('unavailable' in target) throw new AppError('SERVICE_UNAVAILABLE', target.unavailable);
    return target.port;
  }

  private unreachable(route: ProxyRoute, error: Error): AppError {
    this.logger.warn(`${route.name}: request failed: ${error.message}`);
    return new AppError('SERVICE_UNAVAILABLE', `${route.name} did not answer: ${error.message}`);
  }

  /** Keeps both sockets of a tunnel until either closes, then closes the other. */
  private track(client: Duplex, upstream: Duplex): void {
    const end = () => {
      this.tunnels.delete(client);
      this.tunnels.delete(upstream);
      client.destroy();
      upstream.destroy();
    };
    this.tunnels.add(client);
    this.tunnels.add(upstream);
    client.once('close', end);
    upstream.once('close', end);
  }
}
