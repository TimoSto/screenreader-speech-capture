import http from 'node:http';
import type { Duplex } from 'node:stream';
import { ERROR_STATUS, type ErrorBodyDto } from '@screenreader-speech-capture/shared';
import type { Logger } from '../../../application/ports/out/logger.js';
import { AppError } from '../../../domain/errors.js';
import { sendJson } from './response.js';

/**
 * The error body every endpoint uses (docs/http-api.md#errors) and its status. An `AppError`
 * keeps its code. Anything else is `INTERNAL`, with the details in the bridge log only.
 */
export function errorResponse(
  error: unknown,
  logger: Logger,
): { status: number; body: ErrorBodyDto } {
  let body: ErrorBodyDto;
  if (error instanceof AppError) {
    body = { error: { code: error.code, message: error.message } };
    if (error.details !== undefined) body.error.details = error.details;
  } else {
    logger.error(
      `internal error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    body = { error: { code: 'INTERNAL', message: 'Internal error, see the bridge log' } };
  }
  return { status: ERROR_STATUS[body.error.code], body };
}

/** Sends the error body every endpoint uses (docs/http-api.md#errors). */
export function sendError(res: http.ServerResponse, error: unknown, logger: Logger): void {
  const { status, body } = errorResponse(error, logger);
  if (res.headersSent) {
    // For example an SSE stream that already started: nothing sensible left to send.
    res.destroy();
    return;
  }
  sendJson(res, status, body);
}

/**
 * The same answer on the raw socket of a WebSocket upgrade, which has no `ServerResponse`, then
 * closes it.
 */
export function sendSocketError(socket: Duplex, error: unknown, logger: Logger): void {
  const { status, body } = errorResponse(error, logger);
  const data = JSON.stringify(body);
  socket.end(
    `HTTP/1.1 ${status} ${http.STATUS_CODES[status] ?? 'Error'}\r\n` +
      'content-type: application/json; charset=utf-8\r\n' +
      `content-length: ${Buffer.byteLength(data)}\r\n` +
      'connection: close\r\n\r\n' +
      data,
  );
}
