import { API_VERSION_HEADER } from '@screenreader-speech-capture/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import { accepts } from '../../../../test/helpers.js';
import { ListenError } from '../../shared/net/listen.js';
import { HttpServer } from './http-server.js';
import type { UiHandler } from './ui-handler.js';

// The routes are covered by the integration tests (test/http-api.test.ts). Here: the server's
// own lifecycle, so the ports stay unused and an unknown path is enough to see who answers.
/** A port the test never calls (`never` fits every port type). */
const unused = {} as never;
const servers: HttpServer[] = [];
afterEach(() => Promise.all(servers.splice(0).map((s) => s.stop())));

function server(ui?: UiHandler) {
  const logger = new MemoryLogger();
  const http = new HttpServer({
    speech: unused,
    waits: unused,
    status: unused,
    config: unused,
    sessions: unused,
    input: unused,
    captures: unused,
    focus: unused,
    logger,
    ...(ui ? { ui } : {}),
  });
  servers.push(http);
  return { http, logger };
}

describe('HttpServer', () => {
  it('answers on the bound port and logs it, with errors as JSON', async () => {
    const { http, logger } = server();
    const port = await http.start({ host: '127.0.0.1', port: 0, allowedHosts: [] });
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(logger.lines).toContain(`debug listening on http://127.0.0.1:${port}`);
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

  describe('web UI', () => {
    const ui: UiHandler = (req, res) => {
      res.end(`ui ${req.url}`);
      return Promise.resolve();
    };
    const settings = { host: '127.0.0.1', port: 0, allowedHosts: [] };

    it('answers every path outside the API', async () => {
      const { http } = server(ui);
      const port = await http.start(settings);
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('ui /');
      expect(await (await fetch(`http://127.0.0.1:${port}/live?x=1`)).text()).toBe('ui /live?x=1');
      // Not the API prefix: `/api/v10` is the UI's.
      expect(await (await fetch(`http://127.0.0.1:${port}/api/v10`)).text()).toBe('ui /api/v10');
      // The API version header is the API's only.
      expect((await fetch(`http://127.0.0.1:${port}/`)).headers.has(API_VERSION_HEADER)).toBe(
        false,
      );
    });

    it('leaves the API to the router, so an unknown API path is still a 404 error body', async () => {
      const { http } = server(ui);
      const port = await http.start(settings);
      for (const path of ['/api/v1', '/api/v1/nope']) {
        const res = await fetch(`http://127.0.0.1:${port}${path}`);
        expect(res.status).toBe(404);
        expect(await res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
      }
    });

    it('applies the Host rules to the UI too', async () => {
      const { http } = server(ui);
      const port = await http.start(settings);
      const net = await import('node:net');
      const socket = net.connect(port, '127.0.0.1');
      socket.end('GET / HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n');
      let raw = '';
      for await (const chunk of socket) raw += String(chunk);
      expect(raw).toMatch(/^HTTP\/1\.1 403/);
    });

    it('logs where the UI is reachable, only when there is one', async () => {
      const withUi = server(ui);
      const port = await withUi.http.start(settings);
      expect(withUi.logger.lines).toContain(`debug web UI at http://127.0.0.1:${port}`);
      const without = server();
      await without.http.start(settings);
      expect(without.logger.lines.filter((l) => l.includes('web UI'))).toEqual([]);
    });

    it('answers 404 outside the API when there is no UI', async () => {
      const { http } = server();
      const port = await http.start(settings);
      expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
    });
  });
});
