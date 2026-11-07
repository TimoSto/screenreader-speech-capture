import type http from 'node:http';
import { ERROR_STATUS, type ErrorBodyDto } from '@screenreader-speech-capture/shared';
import type { Logger } from '../../../application/ports/out/logger.js';
import { AppError } from '../../../domain/errors.js';
import { sendJson } from './response.js';

/**
 * Sends the error body every endpoint uses (docs/http-api.md#errors). An `AppError` keeps its
 * code. Anything else is `INTERNAL`, with the details in the bridge log only.
 */
export function sendError(res: http.ServerResponse, error: unknown, logger: Logger): void {
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
  if (res.headersSent) {
    // For example an SSE stream that already started: nothing sensible left to send.
    res.destroy();
    return;
  }
  sendJson(res, ERROR_STATUS[body.error.code], body);
}
