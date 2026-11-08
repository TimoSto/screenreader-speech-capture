import net from 'node:net';
import { afterEach } from 'vitest';
import type { LogSink } from '../src/adapters/out/log/log.js';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  mergePatch,
  validatePatch,
  type Config,
  type ConfigPatch,
} from '../src/domain/config.js';
import { startBridge, type Bridge } from '../src/main.js';
import { MemoryConfigStore } from './fakes.js';

/** Free loopback ports, plus `patch`: what tests pass like flags. */
export function testOverrides(patch: unknown = {}): ConfigPatch {
  return mergePatch(
    { tcp: { port: 0 }, http: { host: '127.0.0.1', port: 0 } },
    validatePatch(patch),
  );
}

/** Default config on free loopback ports, plus `patch`. */
export function testConfig(patch: unknown = {}): Config {
  return mergeConfig(DEFAULT_CONFIG, testOverrides(patch));
}

const bridges: Bridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
});

/**
 * Starts a bridge that is stopped after the test, with `patch` as flags and `store` (default:
 * an empty one) as the config file. Silent unless `sinks` are given.
 */
export async function start(
  patch: unknown = {},
  options: { sinks?: LogSink[]; ssePingMs?: number; store?: MemoryConfigStore } = {},
): Promise<Bridge> {
  const bridge = await startBridge({
    version: '0.0.0-test',
    overrides: testOverrides(patch),
    configStore: options.store ?? new MemoryConfigStore(),
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

/** A loopback port that was free a moment ago. */
export async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/** Resolves with whether something accepts connections on `port`. */
export function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}
