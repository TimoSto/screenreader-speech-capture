import net from 'node:net';
import { afterEach } from 'vitest';
import type { LogSink } from '../src/adapters/out/log/log.js';
import { DEFAULT_CONFIG, mergeConfig, type Config } from '../src/domain/config.js';
import { startBridge, type Bridge } from '../src/main.js';

/** Default config on free loopback ports, plus `patch`. */
export function testConfig(patch: unknown = {}): Config {
  const base = mergeConfig(DEFAULT_CONFIG, {
    tcp: { port: 0 },
    http: { host: '127.0.0.1', port: 0 },
  });
  return mergeConfig(base, patch);
}

const bridges: Bridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
});

/** Starts a bridge that is stopped after the test. Silent unless `sinks` are given. */
export async function start(
  patch: unknown = {},
  options: { sinks?: LogSink[]; ssePingMs?: number } = {},
): Promise<Bridge> {
  const bridge = await startBridge({
    config: testConfig(patch),
    version: '0.0.0-test',
    sinks: options.sinks ?? [],
    ...(options.ssePingMs === undefined ? {} : { ssePingMs: options.ssePingMs }),
  });
  bridges.push(bridge);
  return bridge;
}

/** Connects like a socket voice, sends `chunks` and closes. */
export async function send(port: number, ...chunks: (string | Buffer)[]): Promise<void> {
  const socket = net.connect(port, '127.0.0.1');
  await new Promise<void>((resolve) => socket.once('connect', resolve));
  for (const chunk of chunks) socket.write(chunk);
  await new Promise<void>((resolve) => socket.end(resolve));
  await new Promise((resolve) => socket.once('close', resolve));
}

/** Polls `read` until `ok` (at most about a second), then returns the last value. */
export async function eventually<T>(
  read: () => T | Promise<T>,
  ok: (value: T) => boolean,
): Promise<T> {
  for (let i = 0; i < 100; i++) {
    const value = await read();
    if (ok(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return read();
}
