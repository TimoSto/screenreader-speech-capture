import { describe, expect, it } from 'vitest';
import { createBridgeApi } from './bridge-api';

const service = { state: 'running', version: '1.0.0', port: 3000, restarts: 0, exitCode: null };

const status = {
  bridge: {
    version: '1.2.3',
    apiVersion: '1.4',
    state: 'ready',
    startedAt: '2026-01-01T00:00:00.000Z',
  },
  tcp: { listening: true, host: '127.0.0.1', port: 4449, encoding: 'utf-8', connections: [] },
  buffer: { size: 0, maxEntries: 1000, firstSeq: null, lastSeq: null },
  playwright: service,
  mcp: { ...service, port: 8931 },
  session: { current: null, count: 0 },
};

function fakeFetch(respond: (url: string) => Response | Promise<Response>): typeof fetch {
  return (input) => Promise.resolve(respond(input instanceof Request ? input.url : String(input)));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createBridgeApi', () => {
  it('reads the status from the API under the base URL', async () => {
    let requested = '';
    const api = createBridgeApi(
      'http://127.0.0.1:5151/',
      fakeFetch((url) => {
        requested = url;
        return json(status);
      }),
    );
    const result = await api.status();
    expect(requested).toBe('http://127.0.0.1:5151/api/v1/status');
    expect(result.bridge.version).toBe('1.2.3');
  });

  it('maps an API error to its status and message', async () => {
    const api = createBridgeApi(
      'http://bridge',
      fakeFetch(() => json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404)),
    );
    await expect(api.status()).rejects.toMatchObject({ status: 404 });
  });

  it('answers 502 when the bridge is unreachable', async () => {
    const api = createBridgeApi('http://bridge', () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(api.status()).rejects.toMatchObject({ status: 502 });
  });

  it('answers 502 when the answer does not match the contract', async () => {
    const api = createBridgeApi(
      'http://bridge',
      fakeFetch(() => json({ nope: true })),
    );
    await expect(api.status()).rejects.toMatchObject({ status: 502 });
  });
});
