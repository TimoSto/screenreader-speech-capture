import net from 'node:net';
import { afterEach } from 'vitest';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  mergePatch,
  validatePatch,
  type Config,
  type ConfigPatch,
} from '../src/domain/config/index.js';
import type { TestSeams } from '../src/composition/test-seams.js';
import type { Clock } from '../src/application/ports/out/clock.js';
import { SystemClock } from '../src/adapters/out/clock/system-clock.js';
import { startBridge, type Bridge } from '../src/main.js';
import { MemoryConfigStore } from './fakes.js';

/** Free loopback ports, plus `patch`: what tests pass like flags. */
export function testOverrides(patch: unknown = {}): ConfigPatch {
  return mergePatch(
    {
      tcp: { port: 0 },
      http: { host: '127.0.0.1', port: 0 },
      // No real Playwright or MCP install in tests; service tests enable them with a fake launch.
      playwright: { enabled: false },
      mcp: { enabled: false },
    },
    validatePatch(patch),
  );
}

/** Default config on free loopback ports, plus `patch`. */
export function testConfig(patch: unknown = {}): Config {
  return mergeConfig(DEFAULT_CONFIG, testOverrides(patch));
}

const bridges: Bridge[] = [];

/**
 * The system clock moved back so its first `now()` is 1 ms after the epoch. A bridge started with
 * it counts `seq` from 1 (`seq` starts at the start time in ms), like the tests expect.
 */
export function epochClock(): Clock {
  let offset: number | undefined;
  return {
    now: () => {
      // One reading, so the first call is exactly 1 even across a millisecond boundary.
      const now = Date.now();
      offset ??= now - 1;
      return new Date(now - offset);
    },
    sleep: (ms, signal) => new SystemClock().sleep(ms, signal),
  };
}

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.stop()));
});

/**
 * Starts a bridge that is stopped after the test, with `patch` as flags and `store` (default:
 * an empty one) as the config file. Silent unless `sinks` are given. `seq` starts at 1 unless a
 * `clock` is given ({@link epochClock}).
 */
export async function start(
  patch: unknown = {},
  options: { store?: MemoryConfigStore } & Pick<
    TestSeams,
    'sinks' | 'ssePingMs' | 'playwrightLaunch' | 'mcpLaunch' | 'clock'
  > = {},
): Promise<Bridge> {
  const { store, sinks, ...rest } = options;
  const bridge = await startBridge({
    version: '0.0.0-test',
    overrides: testOverrides(patch),
    testSeams: {
      configStore: store ?? new MemoryConfigStore(),
      sinks: sinks ?? [],
      clock: epochClock(),
      ...rest,
    },
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

/** Polls `read` every 10 ms until `ok` (at most `attempts` times), then returns the last value. */
export async function eventually<T>(
  read: () => T | Promise<T>,
  ok: (value: T) => boolean,
  attempts = 100,
): Promise<T> {
  for (let i = 0; i < attempts; i++) {
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
