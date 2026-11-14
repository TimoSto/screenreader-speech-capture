import type {
  ConfigDto,
  ConfigResponseDto,
  ErrorBodyDto,
  StatusDto,
} from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import { MemoryConfigStore } from './fakes.js';
import { eventually, send, start } from './helpers.js';
import { ConfigError, startBridge, type Bridge } from '../src/main.js';

const api = (bridge: Bridge, path: string) => `http://127.0.0.1:${bridge.httpPort}/api/v1${path}`;

function put(bridge: Bridge, body: unknown, type = 'application/json') {
  return fetch(api(bridge, '/config'), {
    method: 'PUT',
    headers: { 'content-type': type },
    body: JSON.stringify(body),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** A sink that keeps the bridge log lines, without colours. */
function captureLog() {
  const lines: string[] = [];
  return {
    lines,
    sinks: [{ colour: false, speech: false, write: (line: string) => lines.push(line) }],
  };
}

describe('PUT /api/v1/config', () => {
  it('rejects invalid values with the field and a body that is not JSON', async () => {
    const bridge = await start();
    const invalid = await put(bridge, { tcp: { port: 70000 } });
    expect(invalid.status).toBe(400);
    expect((await json<ErrorBodyDto>(invalid)).error.details).toEqual({ field: 'tcp.port' });

    const unknown = await put(bridge, { tcp: { nope: 1 } });
    expect((await json<ErrorBodyDto>(unknown)).error.details).toEqual({ field: 'tcp.nope' });

    const text = await put(bridge, { buffer: { maxEntries: 5 } }, 'text/plain');
    expect(text.status).toBe(400);
    expect((await json<ErrorBodyDto>(text)).error.details).toEqual({ field: 'content-type' });
  });

  it('applies the buffer size live and saves only the changed setting', async () => {
    const store = new MemoryConfigStore();
    const bridge = await start({}, { store });
    const response = await put(bridge, { buffer: { maxEntries: 5 } });
    expect(response.status).toBe(200);
    expect((await json<ConfigDto>(response)).buffer.maxEntries).toBe(5);

    const status = await json<StatusDto>(await fetch(api(bridge, '/status')));
    expect(status.buffer.maxEntries).toBe(5);
    // The ports the test passes like flags are not written to the file.
    expect(store.saved).toEqual({ buffer: { maxEntries: 5 } });
  });

  it('saves restart-only settings for the next start and reports them as restartRequired', async () => {
    const store = new MemoryConfigStore();
    const bridge = await start({}, { store });
    const response = await put(bridge, { tcp: { encoding: 'utf-8' }, buffer: { maxEntries: 5 } });
    expect(response.status).toBe(200);
    const body = await json<ConfigResponseDto>(response);
    expect(body.restartRequired).toEqual(['tcp.encoding']);
    expect(body.tcp.encoding).toBe('windows-1252');
    expect(body.buffer.maxEntries).toBe(5);
    expect(store.saved).toEqual({ tcp: { encoding: 'utf-8' }, buffer: { maxEntries: 5 } });

    // Still decoded with the encoding of the start.
    await send(bridge.tcpPort, Buffer.from([0x4d, 0xe4, 0x72, 0x7a, 0x0d, 0x0a]));
    const entries = await eventually(
      () => bridge.speech.list().entries,
      (list) => list.length === 1,
    );
    expect(entries[0]!.text).toBe('März');

    const current = await json<ConfigResponseDto>(await fetch(api(bridge, '/config')));
    expect(current.restartRequired).toEqual(['tcp.encoding']);

    // The next start takes it.
    const next = await start({}, { store });
    const after = await json<ConfigResponseDto>(await fetch(api(next, '/config')));
    expect(after.tcp.encoding).toBe('utf-8');
    expect(after.restartRequired).toEqual([]);
    // The answer of a GET can be sent back as it is.
    expect((await put(next, after)).status).toBe(200);
  });

  it('warns when a flag or env var will override the saved setting on the next start', async () => {
    const { lines, sinks } = captureLog();
    const bridge = await start({ log: { level: 'info' } }, { sinks });
    expect((await put(bridge, { log: { level: 'warn' } })).status).toBe(200);
    expect(lines.filter((line) => line.includes('WARN'))).toEqual([
      expect.stringMatching(
        /^\[config\] .* WARN {2}log\.level: saved to memory:config\.json, but a flag or environment variable overrides it on the next start$/,
      ),
    ]);
  });
});

describe('config file at startup', () => {
  it('loads the file, lets flags win and warns about each overridden setting', async () => {
    const { lines, sinks } = captureLog();
    const store = new MemoryConfigStore({ buffer: { maxEntries: 42 }, log: { level: 'warn' } });
    const bridge = await start({ buffer: { maxEntries: 7 } }, { store, sinks });

    const config = await json<ConfigDto>(await fetch(api(bridge, '/config')));
    expect(config.buffer.maxEntries).toBe(7);
    expect(config.log.level).toBe('warn');
    expect(lines.filter((line) => line.includes('WARN'))).toEqual([
      expect.stringMatching(
        /^\[config\] .* WARN {2}buffer\.maxEntries: the config file sets 42, but a flag or environment variable sets 7, which wins$/,
      ),
    ]);
    expect(lines[0]).toContain('config memory:config.json');
  });

  it('refuses to start with an invalid setting in the file, naming the file and the setting', async () => {
    const start = startBridge({
      version: '0.0.0-test',
      testSeams: { sinks: [], configStore: new MemoryConfigStore({ tcp: { port: 'x' } }) },
    });
    await expect(start).rejects.toThrow(ConfigError);
    await expect(start).rejects.toThrow(
      'Invalid setting in the config file memory:config.json: tcp.port: must be an integer',
    );
  });

  it('names the flag or variable of an invalid override', async () => {
    const start = startBridge({
      version: '0.0.0-test',
      testSeams: { sinks: [], configStore: new MemoryConfigStore() },
      overrides: { tcp: { port: 70000 } },
      overrideSources: new Map([['tcp.port', '--tcp-port']]),
    });
    await expect(start).rejects.toThrow('Invalid --tcp-port: tcp.port: must be an integer');
  });
});
