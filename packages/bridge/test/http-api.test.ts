import type {
  ErrorBodyDto,
  SpeechEntryDto,
  SpeechListDto,
  StatusDto,
} from '@screenreader-speech-capture/shared';
import { API_VERSION } from '@screenreader-speech-capture/shared';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import type { Bridge } from '../src/main.js';
import { eventually, send, start, testConfig } from './helpers.js';

const api = (bridge: Bridge, path: string) => `http://127.0.0.1:${bridge.httpPort}/api/v1${path}`;

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function errorOf(response: Response) {
  return (await json<ErrorBodyDto>(response)).error;
}

/** Opens the SSE stream and collects its raw text. */
async function openStream(bridge: Bridge, headers: Record<string, string> = {}) {
  const controller = new AbortController();
  const response = await fetch(api(bridge, '/speech/stream'), {
    headers,
    signal: controller.signal,
  });
  const stream = { response, text: '', close: () => controller.abort() };
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        stream.text += value;
      }
    } catch {
      // aborted
    }
  })();
  return stream;
}

describe('HTTP API', () => {
  it('lists speech as DTOs and clears it, with seq counting on', async () => {
    const bridge = await start();
    await send(bridge.tcpPort, 'voice=dev\r\none\r\ntwo\r\n');
    await eventually(
      () => bridge.speech.list({ since: 0, limit: 10 }).entries,
      (entries) => entries.length === 2,
    );

    const list = await json<SpeechListDto>(await fetch(api(bridge, '/speech?since=1')));
    expect(list.truncated).toBe(false);
    expect(list.hasMore).toBe(false);
    const [entry] = list.entries;
    expect(list.entries).toEqual([
      {
        seq: 2,
        kind: 'speech',
        text: 'two',
        receivedAt: entry!.receivedAt,
        source: 'tcp',
        voice: 'dev',
        connectionId: 1,
      },
    ]);
    expect(new Date(entry!.receivedAt).toISOString()).toBe(entry!.receivedAt);
    const first = await json<SpeechListDto>(await fetch(api(bridge, '/speech?limit=1')));
    expect(first.entries.map((e) => e.seq)).toEqual([1]);
    expect(first.hasMore).toBe(true);
    const next = await json<SpeechListDto>(await fetch(api(bridge, '/speech?since=1&limit=1')));
    expect(next.entries.map((e) => e.seq)).toEqual([2]);
    expect(next.hasMore).toBe(false);

    const cleared = await fetch(api(bridge, '/speech'), { method: 'DELETE' });
    expect(cleared.status).toBe(204);
    expect((await json<SpeechListDto>(await fetch(api(bridge, '/speech')))).entries).toEqual([]);

    const marker = await fetch(api(bridge, '/markers'), {
      method: 'POST',
      body: JSON.stringify({ label: 'after clear' }),
    });
    expect((await json<SpeechEntryDto>(marker)).seq).toBe(3);
  });

  it('rejects bad query values with INVALID_REQUEST and the field', async () => {
    const bridge = await start();
    const response = await fetch(api(bridge, '/speech?limit=0'));
    expect(response.status).toBe(400);
    expect(await errorOf(response)).toEqual({
      code: 'INVALID_REQUEST',
      message: 'limit: must be an integer from 1 to 10000',
      details: { field: 'limit' },
    });
  });

  it('adds markers and validates the body', async () => {
    const bridge = await start();
    const created = await fetch(api(bridge, '/markers'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ label: ' step 3 ' }),
    });
    expect(created.status).toBe(201);
    expect(await json<SpeechEntryDto>(created)).toMatchObject({
      seq: 1,
      kind: 'marker',
      text: 'step 3',
      source: 'api',
      voice: null,
      connectionId: null,
    });

    const missing = await fetch(api(bridge, '/markers'), { method: 'POST', body: '{}' });
    expect(missing.status).toBe(400);
    expect((await errorOf(missing)).details).toEqual({ field: 'label' });

    const broken = await fetch(api(bridge, '/markers'), { method: 'POST', body: '{"label":' });
    expect(broken.status).toBe(400);
    expect((await errorOf(broken)).details).toEqual({ field: 'body' });
  });

  it('long-polls with wait until a matching line arrives', async () => {
    const bridge = await start();
    const pending = fetch(api(bridge, '/speech/wait?contains=submit&normalize=1&timeoutMs=5000'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await send(bridge.tcpPort, 'Name, edit\r\nSUBMIT, button\r\n');

    const response = await pending;
    expect(response.status).toBe(200);
    expect(await json<SpeechEntryDto>(response)).toMatchObject({ seq: 2, text: 'SUBMIT, button' });
  });

  it('answers 408 TIMEOUT with the entries seen so far', async () => {
    const bridge = await start();
    await send(bridge.tcpPort, 'Name, edit\r\n');
    await eventually(
      () => bridge.speech.list({ since: 0, limit: 10 }).entries,
      (entries) => entries.length === 1,
    );
    const response = await fetch(api(bridge, '/speech/wait?regex=%5ESubmit&timeoutMs=50'));
    expect(response.status).toBe(408);
    const error = await errorOf(response);
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('No speech matched /^Submit/ within 50 ms');
    const entries = error.details!.entries as SpeechEntryDto[];
    expect(entries.map((e) => [e.text, typeof e.receivedAt])).toEqual([['Name, edit', 'string']]);
  });

  it('drops a wait quietly when the client disconnects', async () => {
    const lines: string[] = [];
    const bridge = await start(
      {},
      { sinks: [{ colour: false, speech: false, write: (line) => lines.push(line) }] },
    );
    const controller = new AbortController();
    const pending = fetch(api(bridge, '/speech/wait?contains=never&timeoutMs=60000'), {
      signal: controller.signal,
    }).catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    controller.abort();
    await pending;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(lines.filter((line) => line.includes('ERROR'))).toEqual([]);
  });

  it('rejects a wait without contains or regex', async () => {
    const bridge = await start();
    const response = await fetch(api(bridge, '/speech/wait'));
    expect(response.status).toBe(400);
    expect((await errorOf(response)).code).toBe('INVALID_REQUEST');
  });

  it('streams entries and clears over SSE, and replays after Last-Event-ID', async () => {
    const bridge = await start();
    const stream = await openStream(bridge);
    expect(stream.response.headers.get('content-type')).toMatch(/^text\/event-stream/);

    await send(bridge.tcpPort, 'one\r\ntwo\r\n');
    await fetch(api(bridge, '/speech'), { method: 'DELETE' });
    await eventually(
      () => stream.text,
      (text) => text.includes('event: clear'),
    );
    stream.close();

    const frames = stream.text.split('\n\n').filter((frame) => frame !== '');
    expect(frames[0]).toMatch(/^id: 1\nevent: entry\ndata: \{"seq":1,"kind":"speech","text":"one"/);
    expect(frames[1]).toMatch(/^id: 2\nevent: entry\n/);
    expect(frames[2]).toBe('event: clear\ndata: {}');

    await send(bridge.tcpPort, 'three\r\nfour\r\n');
    await eventually(
      () => bridge.speech.list({ since: 0, limit: 10 }).entries,
      (entries) => entries.length === 2,
    );
    const resumed = await openStream(bridge, { 'last-event-id': '3' });
    await eventually(
      () => resumed.text,
      (text) => text.includes('four'),
    );
    resumed.close();
    expect(resumed.text).not.toContain('"three"');
    expect(resumed.text).toMatch(/^id: 4\nevent: entry\n/);
  });

  it('sends a ping comment on idle SSE streams', async () => {
    const bridge = await start({}, { ssePingMs: 20 });
    const stream = await openStream(bridge);
    await eventually(
      () => stream.text,
      (text) => text.includes(': ping\n\n'),
    );
    stream.close();
    expect(stream.text).toContain(': ping\n\n');
  });

  it('reports the status with versions, connections and buffer', async () => {
    const bridge = await start();
    const socket = net.connect(bridge.tcpPort, '127.0.0.1');
    socket.write('voice=open\r\nhello\r\n');
    const status = await eventually(
      async () => json<StatusDto>(await fetch(api(bridge, '/status'))),
      (body) => body.buffer.size === 1,
    );
    socket.destroy();

    expect(status.tcp.connections[0]!.connectedAt).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect(status).toEqual({
      bridge: { version: '0.0.0-test', apiVersion: API_VERSION, state: 'ready' },
      tcp: {
        listening: true,
        host: '127.0.0.1',
        port: bridge.tcpPort,
        encoding: 'windows-1252',
        connections: [
          { id: 1, voice: 'open', connectedAt: status.tcp.connections[0]!.connectedAt },
        ],
      },
      buffer: { size: 1, maxEntries: 10000, firstSeq: 1, lastSeq: 1 },
      input: { enabled: true },
    });
  });

  it('serves the configuration', async () => {
    const bridge = await start({ buffer: { maxEntries: 42 } });
    const config = await json<unknown>(await fetch(api(bridge, '/config')));
    expect(config).toEqual(
      JSON.parse(JSON.stringify(testConfig({ buffer: { maxEntries: 42 } }))) as unknown,
    );
  });

  it('answers unknown endpoints and methods with 404 NOT_FOUND', async () => {
    const bridge = await start();
    for (const [method, path] of [
      ['GET', '/nope'],
      ['PUT', '/speech'],
    ] as const) {
      const response = await fetch(api(bridge, path), { method });
      expect(response.status).toBe(404);
      expect(await errorOf(response)).toEqual({
        code: 'NOT_FOUND',
        message: `Unknown endpoint ${method} /api/v1${path}`,
      });
    }
  });

  it('ends a pending wait with 503 and open streams when the bridge stops', async () => {
    const bridge = await start();
    const stream = await openStream(bridge);
    const pending = fetch(api(bridge, '/speech/wait?contains=never&timeoutMs=60000'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    await bridge.stop();

    const response = await pending;
    expect(response.status).toBe(503);
    expect((await errorOf(response)).code).toBe('SERVICE_UNAVAILABLE');
    stream.close();
  });

  it('fails to start when the HTTP port is in use', async () => {
    const first = await start();
    await expect(start({ http: { port: first.httpPort } })).rejects.toThrow(/already in use/);
  });
});
