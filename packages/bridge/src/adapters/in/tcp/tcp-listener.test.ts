import net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import type { CapturedSpeech } from '../../../application/ports/in/record-speech.js';
import { ListenError } from '../../shared/net/listen.js';
import { TcpListener, type TcpSettings } from './tcp-listener.js';

const settings = (overrides: Partial<TcpSettings> = {}): TcpSettings => ({
  host: '127.0.0.1',
  port: 0,
  format: 'text-to-socket',
  encoding: 'utf-8',
  maxLineBytes: 65536,
  ...overrides,
});

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

function listener() {
  const recorded: CapturedSpeech[] = [];
  const tcp = new TcpListener(
    { record: (speech) => void recorded.push(speech) },
    { now: () => new Date(0) },
    new MemoryLogger(),
  );
  cleanup.push(() => tcp.stop());
  return { tcp, recorded };
}

/** Connects to `port`; resolves once the connection is open, `closed` once it ends. */
async function connect(port: number) {
  const socket = net.connect(port, '127.0.0.1');
  const closed = new Promise<void>((resolve) => socket.on('close', () => resolve()));
  socket.on('error', () => {});
  await new Promise<void>((resolve) => socket.once('connect', () => resolve()));
  cleanup.push(() => Promise.resolve(socket.destroy()));
  return { socket, closed };
}

/** A port held by another server. */
async function busyPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  cleanup.push(() => new Promise((resolve) => server.close(resolve)));
  return (server.address() as net.AddressInfo).port;
}

it('refuses a second start', async () => {
  const { tcp } = listener();
  await tcp.start(settings());
  await expect(tcp.start(settings())).rejects.toThrow('already running');
});

it('moves to a new port and closes the old connections', async () => {
  const { tcp } = listener();
  const oldPort = await tcp.start(settings());
  const { closed } = await connect(oldPort);

  const newPort = await tcp.restart(settings());
  expect(newPort).not.toBe(oldPort);
  await closed;
  expect(tcp.captureStatus().listener).toMatchObject({ listening: true, port: newPort });
  await connect(newPort);
});

it('keeps listening on the old port when the new one is in use', async () => {
  const { tcp } = listener();
  const oldPort = await tcp.start(settings());
  const busy = await busyPort();

  await expect(tcp.restart(settings({ port: busy }))).rejects.toBeInstanceOf(ListenError);
  expect(tcp.captureStatus().listener).toMatchObject({ listening: true, port: oldPort });
  await connect(oldPort);
});

it('rebinds the same port with new settings', async () => {
  const { tcp, recorded } = listener();
  const port = await tcp.start(settings());

  expect(await tcp.restart(settings({ port, encoding: 'windows-1252' }))).toBe(port);
  const { socket } = await connect(port);
  socket.end(Buffer.from([0x4d, 0xe4, 0x72, 0x7a, 0x0d, 0x0a]));
  await expect.poll(() => recorded.map((speech) => speech.text)).toEqual(['März']);
});

it('rebinds the old settings when the same port fails on another host', async () => {
  const { tcp } = listener();
  const port = await tcp.start(settings());

  await expect(tcp.restart(settings({ host: '192.0.2.1', port }))).rejects.toBeInstanceOf(
    ListenError,
  );
  expect(tcp.captureStatus().listener).toMatchObject({ listening: true, host: '127.0.0.1', port });
  await connect(port);
});

it('starts when restarted while stopped', async () => {
  const { tcp } = listener();
  const port = await tcp.restart(settings());
  await connect(port);
});
