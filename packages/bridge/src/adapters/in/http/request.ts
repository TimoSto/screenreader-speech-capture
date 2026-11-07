import type http from 'node:http';
import { invalidField } from '../../../domain/errors.js';

// Parsing of the request: query parameters and the JSON body. Syntax only.

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
