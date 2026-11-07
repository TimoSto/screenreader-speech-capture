import type http from 'node:http';
import { AppError, invalidField } from '../../../domain/errors.js';

export interface RequestContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  url: URL;
}

export type Handler = (context: RequestContext) => void | Promise<void>;

/** Exact-path router: method + path → handler. Anything else is `NOT_FOUND`. */
export class Router {
  private readonly routes = new Map<string, Handler>();

  add(method: string, path: string, handler: Handler): this {
    this.routes.set(`${method} ${path}`, handler);
    return this;
  }

  find(method: string, path: string): Handler {
    const handler = this.routes.get(`${method} ${path}`);
    if (!handler) throw new AppError('NOT_FOUND', `Unknown endpoint ${method} ${path}`);
    return handler;
  }
}

/** An integer query parameter, `fallback` if it is missing. */
export function intParam(
  url: URL,
  name: string,
  { fallback, min, max }: { fallback: number; min: number; max: number },
): number {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw invalidField(name, `must be an integer from ${min} to ${max}`);
  }
  return value;
}

/** A string query parameter, `undefined` if it is missing. */
export function stringParam(url: URL, name: string): string | undefined {
  return url.searchParams.get(name) ?? undefined;
}

/** A boolean query parameter (`1` / `true` / `0` / `false`), `undefined` if it is missing. */
export function booleanParam(url: URL, name: string): boolean | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return undefined;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  throw invalidField(name, 'must be 1, true, 0 or false');
}

export const MAX_BODY_BYTES = 1024 * 1024;

/** Reads the request body as JSON. */
export async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES)
      throw invalidField('body', `must be at most ${MAX_BODY_BYTES} bytes`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw invalidField('body', 'must be valid JSON');
  }
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}
