import type http from 'node:http';
import net from 'node:net';
import { PassThrough } from 'node:stream';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../../test/fakes.js';
import { ServiceProxy } from './service-proxy.js';

const servers: net.Server[] = [];
afterEach(() => void servers.splice(0).forEach((server) => server.close()));

describe('ServiceProxy.upgrade', () => {
  it('closes the upstream connection when the client leaves', async () => {
    const accepted: net.Socket[] = [];
    const server = net.createServer((socket) => accepted.push(socket)).listen(0, '127.0.0.1');
    servers.push(server);
    await once(server, 'listening');
    const { port } = server.address() as net.AddressInfo;
    const proxy = new ServiceProxy(
      [{ name: 'pw', path: '/pw', upstreamPath: '/', scheme: 'ws', target: () => ({ port }) }],
      new MemoryLogger(),
    );
    const client = new PassThrough();
    const req = { method: 'GET', rawHeaders: ['Upgrade', 'websocket'] } as http.IncomingMessage;

    proxy.upgrade(proxy.match('/pw')!, req, client, Buffer.alloc(0), new URL('http://x/pw'));
    client.destroy();

    await new Promise<void>((resolve) => {
      const check = () => (accepted[0]?.destroyed ? resolve() : setTimeout(check, 10));
      check();
    });
    expect(accepted[0]?.destroyed).toBe(true);
  });
});
