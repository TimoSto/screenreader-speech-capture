import type http from 'node:http';
import {
  ERROR_CODES,
  ERROR_STATUS,
  type ErrorCode as ApiErrorCode,
} from '@screenreader-speech-capture/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import { AppError, type ErrorCode } from '../../../domain/errors.js';
import { sendError } from './errors.js';

/** Just enough of a response for `sendJson`. */
class FakeResponse {
  status: number | undefined;
  body: unknown;
  headersSent = false;
  destroyed = false;
  writeHead(status: number) {
    this.status = status;
    return this;
  }
  end(data: string) {
    this.body = JSON.parse(data);
  }
  destroy() {
    this.destroyed = true;
  }
}

function send(error: unknown, res = new FakeResponse()) {
  const logger = new MemoryLogger();
  sendError(res as unknown as http.ServerResponse, error, logger);
  return { res, logger };
}

describe('error codes', () => {
  // The bridge raises every code of the API contract and no other one. A code missing on either
  // side fails `pnpm typecheck`.
  it('are the same in the domain and in the API contract', () => {
    expectTypeOf<ErrorCode>().toEqualTypeOf<ApiErrorCode>();
  });
});

describe('sendError', () => {
  it.each(ERROR_CODES)('sends %s with its status and message', (code) => {
    const { res } = send(new AppError(code, 'nope'));
    expect(res.status).toBe(ERROR_STATUS[code]);
    expect(res.body).toEqual({ error: { code, message: 'nope' } });
  });

  it('keeps the details', () => {
    const { res } = send(new AppError('INVALID_REQUEST', 'x: bad', { field: 'x' }));
    expect(res.body).toEqual({
      error: { code: 'INVALID_REQUEST', message: 'x: bad', details: { field: 'x' } },
    });
  });

  it('answers anything else as INTERNAL and logs it, without leaking it', () => {
    const { res, logger } = send(new Error('disk on fire'));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL', message: 'Internal error, see the bridge log' },
    });
    expect(logger.lines[0]).toMatch(/^error internal error: Error: disk on fire/);
  });

  it('closes a response whose headers were already sent', () => {
    const started = Object.assign(new FakeResponse(), { headersSent: true });
    const { res } = send(new AppError('NOT_FOUND', 'gone'), started);
    expect(res.destroyed).toBe(true);
    expect(res.status).toBeUndefined();
  });
});
