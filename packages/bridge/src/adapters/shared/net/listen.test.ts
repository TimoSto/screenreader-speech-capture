import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { listen, ListenError } from './listen.js';

const servers: net.Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise((resolve) => s.close(() => resolve(undefined)))),
  );
});
const server = () => {
  const s = net.createServer();
  servers.push(s);
  return s;
};

describe('listen', () => {
  it('resolves with the bound port', async () => {
    const port = await listen(server(), '127.0.0.1', 0);
    expect(port).toBeGreaterThan(0);
  });

  it('rejects a port in use with a ListenError that says so', async () => {
    const port = await listen(server(), '127.0.0.1', 0);
    const error = await listen(server(), '127.0.0.1', port).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ListenError);
    expect(error).toMatchObject({ code: 'EADDRINUSE' });
    expect((error as Error).message).toBe(
      `Cannot listen on 127.0.0.1:${port}: the port is already in use (is another bridge running?)`,
    );
  });

  it('rejects an address this machine does not have', async () => {
    const error = await listen(server(), '192.0.2.1', 0).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ListenError);
    expect(error).toMatchObject({ code: 'EADDRNOTAVAIL' });
  });
});
