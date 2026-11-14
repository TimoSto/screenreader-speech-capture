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

it('stop() closes the open connections and reports the listener as not listening', async () => {
  const { tcp } = listener();
  const port = await tcp.start(settings());
  const { closed } = await connect(port);
  await tcp.stop();
  await closed;
  expect(tcp.captureStatus().listener).toMatchObject({ listening: false, port });
});

it('decodes with the configured encoding', async () => {
  const { tcp, recorded } = listener();
  const port = await tcp.start(settings({ encoding: 'windows-1252' }));
  const { socket } = await connect(port);
  socket.end(Buffer.from([0x4d, 0xe4, 0x72, 0x7a, 0x0d, 0x0a]));
  await expect.poll(() => recorded.map((speech) => speech.text)).toEqual(['März']);
});

it('rejects a port that is in use', async () => {
  const { tcp } = listener();
  await expect(tcp.start(settings({ port: await busyPort() }))).rejects.toBeInstanceOf(ListenError);
});
