import type http from 'node:http';
import { AppError } from '../../../domain/errors.js';

export interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
}

export type Handler = (context: RequestContext) => void | Promise<void>;

/**
 * Exact-path router: method + path → handler. Anything else is `NOT_FOUND`. Paths passed to
 * `add` are relative to `prefix`; `find` takes the full path.
 */
export class Router {
  private readonly routes = new Map<string, Handler>();

  constructor(private readonly prefix = '') {}

  add(method: string, path: string, handler: Handler): this {
    this.routes.set(`${method} ${this.prefix}${path}`, handler);
    return this;
  }

  find(method: string, path: string): Handler {
    const handler = this.routes.get(`${method} ${path}`);
    if (!handler) throw new AppError('NOT_FOUND', `Unknown endpoint ${method} ${path}`);
    return handler;
  }
}
