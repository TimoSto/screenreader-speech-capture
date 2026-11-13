import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import { accepts, freePort } from '../../../../test/helpers.js';
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
    instanceId: 'run-1',
    sessions: unused,
    logger,
  });
  servers.push(http);
  return { http, logger };
}

/** The status an HTTP request to `port` gets, `null` if nothing answers. */
async function answer(port: number, host = '127.0.0.1'): Promise<number | null> {
  try {
    const res = await fetch(`http://${host}:${port}/api/v1/nope`, {
      signal: AbortSignal.timeout(2000),
    });
    await res.body?.cancel();
    return res.status;
  } catch {
    return null;
  }
}

describe('HttpServer', () => {
  it('answers on the bound port and logs it, with errors as JSON', async () => {
    const { http, logger } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0 });
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(logger.lines).toContain(`info listening on http://127.0.0.1:${port}`);
  });

  it('refuses a second start', async () => {
    const { http } = server();
    await http.start({ host: '127.0.0.1', port: 0 });
    await expect(http.start({ host: '127.0.0.1', port: 0 })).rejects.toThrow(/already running/);
  });

  it('restart() before start() just starts', async () => {
    const { http } = server();
    const port = await http.restart({ host: '127.0.0.1', port: 0 });
    expect(await answer(port)).toBe(404);
  });

  it('moves to a new port: the new one answers, the old one closes', async () => {
    const { http } = server();
    const before = await http.start({ host: '127.0.0.1', port: 0 });
    const after = await http.restart({ host: '127.0.0.1', port: await freePort() });
    expect(after).not.toBe(before);
    expect(await answer(after)).toBe(404);
    expect(await accepts(before)).toBe(false);
  });

  it('keeps the old server when the new port is in use', async () => {
    const { http: other } = server();
    const taken = await other.start({ host: '127.0.0.1', port: 0 });
    const { http } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0 });
    const error = await http.restart({ host: '127.0.0.1', port: taken }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ListenError);
    expect(await answer(port)).toBe(404);
  });

  it('moves the same port to another host', async () => {
    const { http } = server();
    const port = await http.start({ host: '127.0.0.1', port: await freePort() });
    expect(await http.restart({ host: '0.0.0.0', port })).toBe(port);
    expect(await answer(port)).toBe(404);
  });

  it('goes back to the old address when the same port fails on the new host', async () => {
    const { http, logger } = server();
    const port = await http.start({ host: '127.0.0.1', port: await freePort() });
    const error = await http.restart({ host: '192.0.2.1', port }).catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'EADDRNOTAVAIL' });
    expect(await answer(port)).toBe(404);
    expect(logger.lines.filter((l) => l.startsWith('info listening on'))).toHaveLength(2);
  });

  it('stop() closes the port and can be called twice', async () => {
    const { http, logger } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0 });
    await http.stop();
    await http.stop();
    expect(await accepts(port)).toBe(false);
    expect(logger.lines.filter((l) => l === 'info stopped listening')).toHaveLength(1);
  });

  it('answers a request URL that does not parse with INVALID_REQUEST', async () => {
    const { http } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0 });
    const net = await import('node:net');
    const socket = net.connect(port, '127.0.0.1');
    socket.end('GET http://[ HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    let raw = '';
    for await (const chunk of socket) raw += String(chunk);
    expect(raw).toMatch(/^HTTP\/1\.1 400/);
    expect(raw).toContain('INVALID_REQUEST');
  });
});
