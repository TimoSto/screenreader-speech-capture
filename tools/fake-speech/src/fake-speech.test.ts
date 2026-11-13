import { execFile } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

// The script runs on import, so it is tested as a program: it talks to a TCP server here.
const script = path.join(import.meta.dirname, 'fake-speech.ts');
const root = path.join(import.meta.dirname, '../../..');

let server: net.Server | undefined;
afterEach(
  () => new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve())),
);

/** A TCP server that collects what each connection sends. */
async function voiceServer() {
  const received: Buffer[] = [];
  server = net.createServer((socket) => socket.on('data', (chunk) => received.push(chunk)));
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  return { port, received: () => Buffer.concat(received) };
}

const run = (args: string[], input?: string) => {
  const child = promisify(execFile)(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  if (input !== undefined) child.child.stdin!.end(input);
  return child;
};

/** Waits until the server has the expected bytes (the connection closes after the write). */
async function settled(read: () => Buffer, length: number) {
  for (let i = 0; i < 100 && read().length < length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return read();
}

describe('fake-speech', () => {
  it('sends each text as a CRLF line in latin1, after the voice line', async () => {
    const { port, received } = await voiceServer();
    await run(['--port', String(port), '--voice', 'eloquence', 'Grüße', 'OK button']);
    const expected = Buffer.from('voice=eloquence\r\nGrüße\r\nOK button\r\n', 'latin1');
    expect(await settled(received, expected.length)).toEqual(expected);
  });

  it('reads lines from stdin, in utf-8 when asked', async () => {
    const { port, received } = await voiceServer();
    await run(['--port', String(port), '--encoding', 'utf-8'], 'one\nzwei – drei\n');
    const expected = Buffer.from('one\r\nzwei – drei\r\n', 'utf8');
    expect(await settled(received, expected.length)).toEqual(expected);
  });

  it('rejects an unknown encoding with exit code 2', async () => {
    await expect(run(['--encoding', 'utf-16'])).rejects.toMatchObject({
      code: 2,
      stderr: 'fake-speech: --encoding must be latin1 or utf-8\n',
    });
  });

  it('prints its help', async () => {
    const { stdout } = await run(['--help']);
    expect(stdout).toMatch(/^Usage: fake-speech/);
  });

  it('reports a text it could not deliver, without failing', async () => {
    const { port } = await voiceServer();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    const { stderr } = await run(['--port', String(port), 'lost']);
    expect(stderr).toMatch(/^fake-speech: dropped "lost": /);
  });
});
