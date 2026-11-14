import type { ConfigDto, ErrorBodyDto, StatusDto } from '@screenreader-speech-capture/shared';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { MemoryConfigStore } from './fakes.js';
import { accepts, eventually, freePort, send, start } from './helpers.js';
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

  it('moves the TCP listener to a new port', async () => {
    const bridge = await start();
    const oldPort = bridge.tcpPort;
    const newPort = await freePort();

    const response = await put(bridge, { tcp: { port: newPort } });
    expect(response.status).toBe(200);
    expect(bridge.tcpPort).toBe(newPort);
    expect(await accepts(oldPort)).toBe(false);

    await send(newPort, 'after the move\r\n');
    const entries = await eventually(
      () => bridge.speech.list().entries,
      (list) => list.length === 1,
    );
    expect(entries[0]!.text).toBe('after the move');
  });

  it('keeps the TCP listener when the new port is in use', async () => {
    const blocker = net.createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const busy = (blocker.address() as net.AddressInfo).port;
    try {
      const bridge = await start();
      const oldPort = bridge.tcpPort;

      const response = await put(bridge, { tcp: { port: busy } });
      expect(response.status).toBe(400);
      const { error } = await json<ErrorBodyDto>(response);
      expect(error.details).toEqual({ field: 'tcp.port' });
      expect(error.message).toMatch(/already in use/);

      expect(bridge.tcpPort).toBe(oldPort);
      expect((await json<ConfigDto>(await fetch(api(bridge, '/config')))).tcp.port).toBe(0);
      await send(oldPort, 'still here\r\n');
      await eventually(
        () => bridge.speech.list().entries.length,
        (length) => length === 1,
      );
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it('moves the HTTP API to a new port, answering from the old one', async () => {
    const bridge = await start();
    const oldPort = bridge.httpPort;
    const newPort = await freePort();

    const response = await put(bridge, { http: { port: newPort } });
    expect(response.status).toBe(200);
    expect((await json<ConfigDto>(response)).http.port).toBe(newPort);

    expect(bridge.httpPort).toBe(newPort);
    expect((await fetch(api(bridge, '/status'))).status).toBe(200);
    await eventually(
      () => accepts(oldPort),
      (open) => !open,
    );
    expect(await accepts(oldPort)).toBe(false);
  });

  it('moves the HTTP API to another host on the same port', async () => {
    const bridge = await start();
    const port = bridge.httpPort;
    const response = await put(bridge, { http: { host: '0.0.0.0', port } });
    expect(response.status).toBe(200);
    expect(bridge.httpPort).toBe(port);
    const status = await eventually(
      () =>
        fetch(api(bridge, '/status')).then(
          (r) => r.status,
          () => 0,
        ),
      (code) => code === 200,
    );
    expect(status).toBe(200);
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
    const store = new MemoryConfigStore({ buffer: { maxEntries: 42 }, input: { enabled: false } });
    const bridge = await start({ buffer: { maxEntries: 7 } }, { store, sinks });

    const config = await json<ConfigDto>(await fetch(api(bridge, '/config')));
    expect(config.buffer.maxEntries).toBe(7);
    expect(config.input.enabled).toBe(false);
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
