import type http from 'node:http';
import { describe, expect, it } from 'vitest';
import { sendJson, sendNoContent } from './response.js';

class FakeResponse {
  status: number | undefined;
  headers: Record<string, unknown> | undefined;
  body: string | undefined;
  writeHead(status: number, headers?: Record<string, unknown>) {
    this.status = status;
    this.headers = headers;
    return this;
  }
  end(body?: string) {
    this.body = body;
  }
}

describe('sendJson', () => {
  it('writes the status, a JSON content type and the byte length', () => {
    const res = new FakeResponse();
    sendJson(res as unknown as http.ServerResponse, 201, { text: 'Grüße' });
    expect(res.status).toBe(201);
    expect(res.body).toBe('{"text":"Grüße"}');
    expect(res.headers).toEqual({
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength('{"text":"Grüße"}'),
    });
    expect(res.headers!['content-length']).toBe(18);
  });
});

describe('sendNoContent', () => {
  it('answers 204 without a body', () => {
    const res = new FakeResponse();
    sendNoContent(res as unknown as http.ServerResponse);
    expect(res.status).toBe(204);
    expect(res.body).toBeUndefined();
  });
});
