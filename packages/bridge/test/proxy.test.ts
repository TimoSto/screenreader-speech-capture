// The bridge passes the Playwright server and Playwright MCP through on its HTTP port
// (docs/playwright-mcp.md). Fake child services in HTTP mode show what arrives at them.
import {
  PLAYWRIGHT_MCP_PATH,
  PLAYWRIGHT_PATH,
  type ErrorBodyDto,
  type StatusDto,
} from '@screenreader-speech-capture/shared';
import { once } from 'node:events';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Prepare, ResolvedSettings } from '../src/adapters/out/process/types.js';
import type { Bridge } from '../src/main.js';
import { eventually, freePort, start } from './helpers.js';

const FAKE_SERVICE = path.resolve(import.meta.dirname, 'fixtures/fake-service.mjs');

/** What arrived at the fake MCP. */
interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

/** Runs the fake service in HTTP mode and records the settings it was started with. */
function fakeLaunch(started: ResolvedSettings[]): Prepare {
  return (settings) => {
    started.push(settings);
    return Promise.resolve({
      command: process.execPath,
      args: [FAKE_SERVICE, '--port', String(settings.port), '--http'],
    });
  };
}

/** A bridge with both services running as fakes. */
async function startWithServices() {
  const started: ResolvedSettings[] = [];
  const ports = { playwright: await freePort(), mcp: await freePort() };
  const bridge = await start(
    {
      playwright: { enabled: true, port: ports.playwright },
      mcp: { enabled: true, port: ports.mcp },
    },
    { playwrightLaunch: fakeLaunch(started), mcpLaunch: fakeLaunch(started) },
  );
  await eventually(
    async () =>
      (await (
        await fetch(`http://127.0.0.1:${bridge.httpPort}/api/v1/status`)
      ).json()) as StatusDto,
    (status) => status.bridge.state === 'ready',
  );
  return { bridge, ports, started };
}

const url = (bridge: Bridge, route: string) => `http://127.0.0.1:${bridge.httpPort}${route}`;

/** A plain request with exactly these headers (`fetch` won't send a foreign `Host`). */
async function request(
  bridge: Bridge,
  route: string,
  headers: http.OutgoingHttpHeaders,
): Promise<{ status: number; body: string }> {
  const req = http.request({ host: '127.0.0.1', port: bridge.httpPort, path: route, headers });
  req.end();
  const [res] = (await once(req, 'response')) as [http.IncomingMessage];
  let body = '';
  for await (const chunk of res) body += String(chunk);
  return { status: res.statusCode ?? 0, body };
}

/** A WebSocket handshake on a raw socket: the status line, the headers, and the socket. */
async function upgrade(bridge: Bridge, route: string, extra: Record<string, string> = {}) {
  const socket = net.connect(bridge.httpPort, '127.0.0.1');
  await once(socket, 'connect');
  const headers = {
    Host: `127.0.0.1:${bridge.httpPort}`,
    Upgrade: 'websocket',
    Connection: 'Upgrade',
    'Sec-WebSocket-Version': '13',
    'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
    ...extra,
  };
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  socket.write(`GET ${route} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`);
  let text = '';
  while (!text.includes('\r\n\r\n')) {
    const [chunk] = (await once(socket, 'data')) as [Buffer];
    text += chunk.toString('latin1');
  }
  const [head, rest] = text.split('\r\n\r\n') as [string, string];
  const [statusLine, ...headerLines] = head.split('\r\n');
  const answer = Object.fromEntries(
    headerLines.map((line) => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
    }),
  );
  return { statusLine: statusLine!, headers: answer, rest, socket };
}

describe('service proxy', () => {
  it('starts the services on loopback only', async () => {
    const { started } = await startWithServices();
    expect(started.map((settings) => settings.host)).toEqual(['127.0.0.1', '127.0.0.1']);
  });

  it('passes MCP requests on to /mcp with the query, body and a loopback Host', async () => {
    const { bridge, ports } = await startWithServices();
    const response = await fetch(url(bridge, `${PLAYWRIGHT_MCP_PATH}?x=1`), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${bridge.httpPort}`,
      },
      body: '{"jsonrpc":"2.0"}',
    });
    expect(response.status).toBe(200);
    const seen = (await response.json()) as Seen;
    expect(seen).toMatchObject({ method: 'POST', url: '/mcp?x=1', body: '{"jsonrpc":"2.0"}' });
    expect(seen.headers.host).toBe(`127.0.0.1:${ports.mcp}`);
    expect(seen.headers['content-type']).toBe('application/json');
    // Checked by the bridge, so not passed on: MCP may check it against its own address.
    expect(seen.headers.origin).toBeUndefined();
  });

  it('streams an MCP event stream through as it comes', async () => {
    const { bridge } = await startWithServices();
    const controller = new AbortController();
    const response = await fetch(url(bridge, PLAYWRIGHT_MCP_PATH), { signal: controller.signal });
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    // The fake keeps the stream open: the first event arrives without the response ending.
    const { value } = await reader.read();
    expect(value).toMatch(/^data: \{"method":"GET","url":"\/mcp"/);
    controller.abort();
  });

  it('tunnels a WebSocket to the Playwright server at / and echoes both ways', async () => {
    const { bridge, ports } = await startWithServices();
    const { statusLine, headers, socket } = await upgrade(bridge, `${PLAYWRIGHT_PATH}?a=b`, {
      'x-playwright-launch-options': '{"headless":false}',
    });
    expect(statusLine).toBe('HTTP/1.1 101 Switching Protocols');
    expect(headers['x-seen-url']).toBe('/?a=b');
    expect(headers['x-seen-host']).toBe(`127.0.0.1:${ports.playwright}`);
    socket.write('ping');
    const [echo] = (await once(socket, 'data')) as [Buffer];
    expect(echo.toString()).toBe('ping');
    socket.destroy();
  });

  it('refuses a foreign Host and a foreign Origin, also for reads and WebSockets', async () => {
    const { bridge } = await startWithServices();
    const own = `127.0.0.1:${bridge.httpPort}`;
    const host = await request(bridge, PLAYWRIGHT_MCP_PATH, { host: 'evil.example' });
    expect(host.status).toBe(403);
    const origin = await request(bridge, PLAYWRIGHT_MCP_PATH, {
      host: own,
      origin: 'http://evil.example',
    });
    expect(origin.status).toBe(403);
    expect((JSON.parse(origin.body) as ErrorBodyDto).error.code).toBe('FORBIDDEN');

    const ws = await upgrade(bridge, PLAYWRIGHT_PATH, { Origin: 'http://evil.example' });
    expect(ws.statusLine).toBe('HTTP/1.1 403 Forbidden');
    expect((JSON.parse(ws.rest) as ErrorBodyDto).error.code).toBe('FORBIDDEN');
    ws.socket.destroy();
  });

  it('answers 503 for a disabled service, and 404 for a WebSocket elsewhere', async () => {
    const bridge = await start();
    const mcp = await fetch(url(bridge, PLAYWRIGHT_MCP_PATH), { method: 'POST', body: '{}' });
    expect(mcp.status).toBe(503);
    expect(((await mcp.json()) as ErrorBodyDto).error.message).toBe('Playwright MCP is disabled');

    const ws = await upgrade(bridge, PLAYWRIGHT_PATH);
    expect(ws.statusLine).toBe('HTTP/1.1 503 Service Unavailable');
    expect((JSON.parse(ws.rest) as ErrorBodyDto).error.message).toBe(
      'Playwright server is disabled',
    );
    ws.socket.destroy();

    const elsewhere = await upgrade(bridge, '/api/v1/speech/stream');
    expect(elsewhere.statusLine).toBe('HTTP/1.1 404 Not Found');
    elsewhere.socket.destroy();
  });

  it('closes open WebSocket tunnels when the bridge stops', async () => {
    const { bridge } = await startWithServices();
    const { socket } = await upgrade(bridge, PLAYWRIGHT_PATH);
    const closed = once(socket, 'close');
    await bridge.stop();
    await closed;
  });
});
