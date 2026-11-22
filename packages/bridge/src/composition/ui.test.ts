import { mkdtempSync, writeFileSync } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../test/fakes.js';
import { bridgeApiUrl, createUiMount, LOCAL_HEADER } from './ui.js';

describe('createUiMount', () => {
  it('is undefined without a build of the UI', () => {
    const logger = new MemoryLogger();
    expect(createUiMount(new URL('./no-such-ui/', import.meta.url), logger)).toBeUndefined();
  });
});

describe('the UI handler', () => {
  it('redirects the bare address to /ui/ and hands everything else to the app', async () => {
    const dir = mkdtempSync(`${tmpdir()}/ui-`);
    writeFileSync(`${dir}/handler.js`, 'export const handler = (req, res) => res.end("app");');
    const mount = createUiMount(pathToFileURL(`${dir}/`), new MemoryLogger());
    await mount!.mount('http://127.0.0.1:1');

    let remoteAddress = '127.0.0.1';
    const call = async (url: string) => {
      const out: {
        status?: number;
        headers?: http.OutgoingHttpHeaders;
        body?: string | undefined;
      } = {};
      const res = {
        writeHead(status: number, headers: http.OutgoingHttpHeaders) {
          out.status = status;
          out.headers = headers;
          return res;
        },
        end(body?: string) {
          out.body = body;
        },
      };
      const req = {
        url,
        headers: { [LOCAL_HEADER]: 'spoofed' },
        socket: { remoteAddress },
      } as unknown as http.IncomingMessage;
      await mount!.handler(req, res as unknown as http.ServerResponse);
      return { ...out, req };
    };

    expect(await call('/')).toMatchObject({ status: 302, headers: { location: '/ui/' } });
    const app = await call('/ui/settings');
    expect(app.body).toBe('app');
    // adapter-node would otherwise assume https and SvelteKit's CSRF check would refuse the UI's DELETEs.
    expect(process.env.PROTOCOL_HEADER).toBeDefined();
    expect(app.req.headers[process.env.PROTOCOL_HEADER!]).toBe('http');
    expect(app.req.headers[LOCAL_HEADER]).toBe('1');

    // From another machine the header is gone, even when the client sent one.
    remoteAddress = '203.0.113.7';
    expect((await call('/ui/')).req.headers[LOCAL_HEADER]).toBeUndefined();
  });
});

describe('bridgeApiUrl', () => {
  it.each([
    ['0.0.0.0', 5151, 'http://127.0.0.1:5151'],
    ['', 5151, 'http://127.0.0.1:5151'],
    ['::', 5151, 'http://[::1]:5151'],
    ['127.0.0.1', 1234, 'http://127.0.0.1:1234'],
    ['192.168.1.5', 80, 'http://192.168.1.5:80'],
    ['fe80::1', 80, 'http://[fe80::1]:80'],
  ])('%j → %s', (host, port, url) => {
    expect(bridgeApiUrl(host, port)).toBe(url);
  });
});
