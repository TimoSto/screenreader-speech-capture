import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { portOpen } from './port-probe.js';

let server: net.Server | undefined;
afterEach(
  () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())),
);

function listen(host: string): Promise<number> {
  server = net.createServer();
  return new Promise((resolve) => {
    server!.listen(0, host, () => resolve((server!.address() as net.AddressInfo).port));
  });
}

describe('portOpen', () => {
  it('is true while something listens, false after it closed', async () => {
    const port = await listen('127.0.0.1');
    expect(await portOpen('127.0.0.1', port)).toBe(true);
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    expect(await portOpen('127.0.0.1', port)).toBe(false);
  });

  it('probes a listener on 0.0.0.0 through 127.0.0.1', async () => {
    const port = await listen('0.0.0.0');
    expect(await portOpen('0.0.0.0', port)).toBe(true);
  });
});
