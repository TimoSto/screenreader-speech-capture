import { mkdtempSync, writeFileSync } from 'node:fs';
import type http from 'node:http';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../test/fakes.js';
import { bridgeApiUrl, createUiMount } from './ui.js';

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
      await mount!.handler({ url } as http.IncomingMessage, res as unknown as http.ServerResponse);
      return out;
    };

    expect(await call('/')).toMatchObject({ status: 302, headers: { location: '/ui/' } });
    expect((await call('/ui/settings')).body).toBe('app');
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
