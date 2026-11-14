import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import { accepts } from '../../../../test/helpers.js';
import { ListenError } from '../../shared/net/listen.js';
import { HttpServer } from './http-server.js';

// The routes are covered by the integration tests (test/http-api.test.ts). Here: the server's
// own lifecycle, so the ports stay unused and an unknown path is enough to see who answers.
/** A port the test never calls (`never` fits every port type). */
const unused = {} as never;
const servers: HttpServer[] = [];
afterEach(() => Promise.all(servers.splice(0).map((s) => s.stop())));

function server() {
  const logger = new MemoryLogger();
  const http = new HttpServer({
    speech: unused,
    waits: unused,
    status: unused,
    config: unused,
    sessions: unused,
    logger,
  });
  servers.push(http);
  return { http, logger };
}

/** The status a request to `port` with the `Host` header `host` gets, `null` if nothing answers. */
async function answer(port: number, host: string) {
  const http = await import('node:http');
  return new Promise<number | null>((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/api/v1/nope',
        timeout: 2000,
        headers: { host },
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? null);
      },
    );
    req.on('error', () => resolve(null));
  });
}

describe('HttpServer', () => {
  it('answers on the bound port and logs it, with errors as JSON', async () => {
    const { http, logger } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(logger.lines).toContain(`info listening on http://127.0.0.1:${port}`);
  });

  it('refuses a second start', async () => {
    const { http } = server();
    await http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    await expect(http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] })).rejects.toThrow(
      /already running/,
    );
  });

  it('rejects a port that is in use', async () => {
    const { http: other } = server();
    const taken = await other.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    const { http } = server();
    await expect(
      http.start({ host: '127.0.0.1', port: taken, allowedHosts: [] }),
    ).rejects.toBeInstanceOf(ListenError);
  });

  it('setAllowedHosts() applies to the next request', async () => {
    const { http } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    const request = () => answer(port, 'bridge.lab');
    expect(await request()).toBe(403);
    http.setAllowedHosts(['bridge.lab']);
    expect(await request()).toBe(404);
  });

  it('stop() closes the port and can be called twice', async () => {
    const { http, logger } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    await http.stop();
    await http.stop();
    expect(await accepts(port)).toBe(false);
    expect(logger.lines.filter((l) => l === 'info stopped listening')).toHaveLength(1);
  });

  it('answers a request URL that does not parse with INVALID_REQUEST', async () => {
    const { http } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    const net = await import('node:net');
    const socket = net.connect(port, '127.0.0.1');
    socket.end('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    let raw = '';
    for await (const chunk of socket) raw += String(chunk);
    expect(raw).toMatch(/^HTTP\/1\.1 400/);
    expect(raw).toContain('INVALID_REQUEST');
  });
});
