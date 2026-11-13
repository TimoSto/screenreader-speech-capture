import type http from 'node:http';
import { invalidField } from '../../../domain/errors.js';
import type { SessionFilter } from '../../../domain/session.js';

// Parsing of the request: query parameters, headers and the JSON body. Syntax only.

/**
 * An integer query parameter, `undefined` if it is missing. Only the syntax is checked here:
 * defaults and ranges are use-case rules, applied by the application.
 */
export function intParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === '') return undefined;
  if (!/^-?\d+$/.test(raw)) throw invalidField(name, 'must be an integer');
  return Number(raw);
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

/** The `session` query parameter (a session id or `current`), `undefined` if it is missing. */
export function sessionParam(url: URL): SessionFilter | undefined {
  const raw = url.searchParams.get('session');
  if (raw === null || raw === '') return undefined;
  if (raw === 'current') return 'current';
  const id = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw invalidField('session', 'must be a session id or current');
  }
  return id;
}

export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Rejects a body that isn't declared as `application/json`. Besides being the contract, this
 * keeps web pages from sending it cross-origin: a browser only sends a JSON content type after
 * a CORS preflight, which the bridge doesn't answer.
 */
export function requireJson(req: http.IncomingMessage): void {
  const type = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json') throw invalidField('content-type', 'must be application/json');
}

const tooLarge = () => invalidField('body', `must be at most ${MAX_BODY_BYTES} bytes`);

/** Reads the request body as JSON. */
export async function readJson(req: http.IncomingMessage): Promise<unknown> {
  // Checked before reading, so the client gets the 400 instead of a reset connection. A chunked
  // body that grows too large is cut off while it is read.
  if (Number(req.headers['content-length'] ?? 0) > MAX_BODY_BYTES) throw tooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw tooLarge();
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw invalidField('body', 'must be valid JSON');
  }
}

/** The JSON body of a POST/PUT: checks the content type, then reads it. */
export async function jsonBody(req: http.IncomingMessage): Promise<unknown> {
  requireJson(req);
  return readJson(req);
}

/** `body[name]`, or `undefined` when the body isn't a JSON object. */
function field(body: unknown, name: string): unknown {
  const isObject = typeof body === 'object' && body !== null && !Array.isArray(body);
  return isObject ? (body as Record<string, unknown>)[name] : undefined;
}

/** A required string field of a JSON body. */
export function stringField(body: unknown, name: string): string {
  const value = field(body, name);
  if (typeof value !== 'string') throw invalidField(name, 'must be a string');
  return value;
}

/** An optional string field of a JSON body that may also be `null`. */
export function nullableStringField(body: unknown, name: string): string | null | undefined {
  const value = field(body, name);
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw invalidField(name, 'must be a string or null');
  }
  return value;
}

/** `Last-Event-ID` of an SSE reconnect, `null` on a first connect. */
export function lastEventId(req: http.IncomingMessage): number | null {
  const raw = req.headers['last-event-id'];
  if (raw === undefined || raw === '') return null;
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value)) throw invalidField('Last-Event-ID', 'must be a seq');
  return value;
}
