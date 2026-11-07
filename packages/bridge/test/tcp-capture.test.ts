import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { BridgeLog } from '../src/adapters/out/log/log.js';
import { DEFAULT_CONFIG, mergeConfig } from '../src/domain/config.js';
import { startBridge, type Bridge } from '../src/main.js';

const silentLog = () => new BridgeLog('error', []);
const bridges: Bridge[] = [];

async function start(patch: unknown = {}) {
  const config = mergeConfig(mergeConfig(DEFAULT_CONFIG, { tcp: { port: 0 } }), patch);
  const bridge = await startBridge({ config, version: '0.0.0-test', log: silentLog() });
  bridges.push(bridge);
  return bridge;
}

async function send(port: number, ...chunks: (string | Buffer)[]) {
  const socket = net.connect(port, '127.0.0.1');
  await new Promise<void>((resolve) => socket.once('connect', resolve));
  for (const chunk of chunks) socket.write(chunk);
  await new Promise<void>((resolve) => socket.end(resolve));
  await new Promise((resolve) => socket.once('close', resolve));
}

async function eventually<T>(read: () => T, ok: (value: T) => boolean): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const value = read();
    if (ok(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return read();
}

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
});

describe('TCP capture (real socket)', () => {
  it('records what a socket voice sends', async () => {
    const bridge = await start();
    await send(bridge.tcpPort, 'voice=dev\r\nSubmit, button\r\n', 'Edit, Name, ', 'blank\r\n');

    const entries = await eventually(
      () => bridge.speech.list({ since: 0, limit: 10 }).entries,
      (list) => list.length === 2,
    );
    expect(entries.map((e) => [e.text, e.voice])).toEqual([
      ['Submit, button', 'dev'],
      ['Edit, Name, blank', 'dev'],
    ]);
    expect(entries[0]!.connectionId).toBe(entries[1]!.connectionId);
  });

  it('decodes with the configured encoding and accepts parallel connections', async () => {
    const bridge = await start({ tcp: { encoding: 'windows-1252' } });
    await Promise.all([
      send(bridge.tcpPort, Buffer.from([0x4d, 0xe4, 0x72, 0x7a, 0x0d, 0x0a])),
      send(bridge.tcpPort, 'voice=b\r\nother\r\n'),
    ]);
    const entries = await eventually(
      () => bridge.speech.list({ since: 0, limit: 10 }).entries,
      (list) => list.length === 2,
    );
    expect(entries.map((e) => e.text).sort()).toEqual(['März', 'other']);
    expect(new Set(entries.map((e) => e.connectionId)).size).toBe(2);
  });

  it('keeps the speech text off the console but writes it to the file sink', async () => {
    const console: string[] = [];
    const file: string[] = [];
    const log = new BridgeLog('debug', [
      { colour: false, speech: false, write: (l) => console.push(l) },
      { colour: false, speech: true, write: (l) => file.push(l) },
    ]);
    const config = mergeConfig(DEFAULT_CONFIG, { tcp: { port: 0 }, log: { level: 'debug' } });
    const bridge = await startBridge({ config, version: '0.0.0-test', log });
    bridges.push(bridge);

    await send(bridge.tcpPort, 'Hello\r\n');
    await eventually(
      () => file,
      (lines) => lines.some((line) => line.includes('Hello')),
    );
    expect(file.some((line) => line.endsWith('DEBUG #1 (connection 1) Hello'))).toBe(true);
    expect(console.filter((line) => line.includes('Hello'))).toEqual([]);
    expect(console.some((line) => line.includes('connection 1 opened'))).toBe(true);
  });

  it('reports the listener and stops it on shutdown', async () => {
    const bridge = await start();
    expect(bridge.capture.captureStatus().listener).toEqual({
      listening: true,
      host: '127.0.0.1',
      port: bridge.tcpPort,
      encoding: 'windows-1252',
    });
    await bridge.stop();
    expect(bridge.capture.captureStatus().listener).toMatchObject({ listening: false });
  });

  it('lists open connections and forgets closed ones', async () => {
    const bridge = await start();
    const socket = net.connect(bridge.tcpPort, '127.0.0.1');
    socket.write('voice=open\r\n');
    const open = await eventually(
      () => bridge.capture.captureStatus().connections,
      (list) => list[0]?.voice === 'open',
    );
    expect(open).toMatchObject([{ id: 1, voice: 'open' }]);
    expect(open[0]!.connectedAt).toBeInstanceOf(Date);
    socket.end();
    await eventually(
      () => bridge.capture.captureStatus().connections,
      (list) => list.length === 0,
    );
    expect(bridge.capture.captureStatus().connections).toEqual([]);
  });

  it('fails to start when the port is in use', async () => {
    const first = await start();
    await expect(start({ tcp: { port: first.tcpPort } })).rejects.toThrow(/already in use/);
  });
});
