import { describe, expect, it } from 'vitest';
import { createBridgeApi } from './bridge-api';

const service = { state: 'running', version: '1.0.0', port: 3000, restarts: 0, exitCode: null };

const status = {
  bridge: {
    version: '1.2.3',
    apiVersion: '1.4',
    state: 'ready',
    startedAt: '2026-01-01T00:00:00.000Z',
  },
  tcp: { listening: true, host: '127.0.0.1', port: 4449, encoding: 'utf-8', connections: [] },
  buffer: { size: 0, maxEntries: 1000, firstSeq: null, lastSeq: null },
  playwright: service,
  mcp: { ...service, port: 8931 },
  session: { current: null, count: 0 },
  input: {
    native: { available: true, backend: 'robotjs', reason: null },
    focus: { available: true, backend: 'koffi', reason: null },
  },
};

function fakeFetch(respond: (url: string) => Response | Promise<Response>): typeof fetch {
  return (input) => Promise.resolve(respond(input instanceof Request ? input.url : String(input)));
}

const urlOf = (input: Parameters<typeof fetch>[0]): string =>
  input instanceof Request ? input.url : input instanceof URL ? input.href : input;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createBridgeApi', () => {
  it('reads the status from the API under the base URL', async () => {
    let requested = '';
    const api = createBridgeApi(
      'http://127.0.0.1:5151/',
      fakeFetch((url) => {
        requested = url;
        return json(status);
      }),
    );
    const result = await api.status();
    expect(requested).toBe('http://127.0.0.1:5151/api/v1/status');
    expect(result.bridge.version).toBe('1.2.3');
  });

  it('maps an API error to its status and message', async () => {
    const api = createBridgeApi(
      'http://bridge',
      fakeFetch(() => json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404)),
    );
    await expect(api.status()).rejects.toMatchObject({ status: 404 });
  });

  it('answers 502 when the bridge is unreachable', async () => {
    const api = createBridgeApi('http://bridge', () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(api.status()).rejects.toMatchObject({ status: 502 });
  });

  it('answers 502 when the answer does not match the contract', async () => {
    const api = createBridgeApi(
      'http://bridge',
      fakeFetch(() => json({ nope: true })),
    );
    await expect(api.status()).rejects.toMatchObject({ status: 502 });
  });

  describe('sessions', () => {
    const session = {
      id: 7,
      name: 'checkout test',
      run: null,
      client: 'web-ui',
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: null,
      startSeq: 0,
      firstSeq: null,
      lastSeq: null,
      entries: 0,
    };

    it('lists the sessions', async () => {
      const api = createBridgeApi(
        'http://bridge',
        fakeFetch(() => json({ sessions: [session], currentId: 7, outsideEntries: 4 })),
      );
      await expect(api.sessions()).resolves.toMatchObject({ currentId: 7, outsideEntries: 4 });
    });

    it('starts a session with a JSON body and names itself as the client', async () => {
      let seen: RequestInit | undefined;
      let requested = '';
      const api = createBridgeApi('http://bridge', (input, init) => {
        requested = new Request(input).url;
        seen = init;
        return Promise.resolve(json({ ...session, replaced: null }, 201));
      });
      await api.startSession({ name: 'checkout test', run: 'nightly-42' });
      expect(requested).toBe('http://bridge/api/v1/sessions');
      expect(seen?.method).toBe('POST');
      expect(seen?.body).toBe('{"name":"checkout test","run":"nightly-42"}');
      expect(seen?.headers).toMatchObject({
        'content-type': 'application/json',
        'x-sr-speech-client': 'web-ui',
        // not SvelteKit's default (the UI's own origin), which the bridge refuses on a POST
        origin: 'http://bridge',
      });
    });

    it('ends the current session and accepts the empty 204 answer', async () => {
      let requested = '';
      const api = createBridgeApi('http://bridge', (input) => {
        requested = new Request(input).url;
        return Promise.resolve(new Response(null, { status: 204 }));
      });
      await expect(api.endSession()).resolves.toBeUndefined();
      expect(requested).toBe('http://bridge/api/v1/sessions/end');
    });
  });

  describe('config', () => {
    const config = {
      tcp: { host: '127.0.0.1', port: 4449, encoding: 'windows-1252', maxLineBytes: 65536 },
      http: { host: '127.0.0.1', port: 5151, allowedHosts: [] },
      playwright: { enabled: true, port: 3000, version: null },
      mcp: { enabled: true, port: 8931 },
      buffer: { maxEntries: 10000 },
      log: { level: 'info', file: null, consoleSpeech: false },
    };

    it('reads the active and the saved view and the overrides', async () => {
      const requested: string[] = [];
      const api = createBridgeApi('http://bridge', (input) => {
        const url = new Request(input).url;
        requested.push(url);
        return Promise.resolve(
          json(url.endsWith('/overrides') ? { overrides: { 'tcp.port': '--tcp-port' } } : config),
        );
      });
      await api.config('active');
      await api.config('saved');
      await expect(api.configOverrides()).resolves.toEqual({
        overrides: { 'tcp.port': '--tcp-port' },
      });
      expect(requested).toEqual([
        'http://bridge/api/v1/config?view=active',
        'http://bridge/api/v1/config?view=saved',
        'http://bridge/api/v1/config/overrides',
      ]);
    });

    it('saves a patch with a PUT and answers with the saved config', async () => {
      let seen: RequestInit | undefined;
      const api = createBridgeApi('http://bridge', (_input, init) => {
        seen = init;
        return Promise.resolve(json({ ...config, tcp: { ...config.tcp, port: 4450 } }));
      });
      const saved = await api.updateConfig({ tcp: { port: 4450 } });
      expect(saved.tcp.port).toBe(4450);
      expect(seen?.method).toBe('PUT');
      expect(seen?.body).toBe('{"tcp":{"port":4450}}');
      expect(seen?.headers).toMatchObject({
        'content-type': 'application/json',
        origin: 'http://bridge',
      });
    });

    it('keeps the setting a rejected update names', async () => {
      const api = createBridgeApi(
        'http://bridge',
        fakeFetch(() =>
          json(
            {
              error: {
                code: 'INVALID_REQUEST',
                message: 'tcp.port: the port is already in use',
                details: { field: 'tcp.port' },
              },
            },
            400,
          ),
        ),
      );
      await expect(api.updateConfig({ tcp: { port: 80 } })).rejects.toMatchObject({
        status: 400,
        body: { message: 'tcp.port: the port is already in use', field: 'tcp.port' },
      });
    });
  });

  it('deletes a session with a DELETE and accepts the empty 204 answer', async () => {
    let seen: { url: string; method: string | undefined } | undefined;
    const api = createBridgeApi('http://bridge', (input, init) => {
      seen = { url: urlOf(input), method: init?.method };
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await expect(api.deleteSession(4)).resolves.toBeUndefined();
    expect(seen).toEqual({ url: 'http://bridge/api/v1/sessions?session=4', method: 'DELETE' });
  });

  it('clears the speech of a scope with a DELETE and accepts the empty 204 answer', async () => {
    let seen: { url: string; method: string | undefined } | undefined;
    const api = createBridgeApi('http://bridge', (input, init) => {
      seen = { url: urlOf(input), method: init?.method };
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await expect(api.clearSpeech('none')).resolves.toBeUndefined();
    expect(seen).toEqual({ url: 'http://bridge/api/v1/speech?session=none', method: 'DELETE' });
  });

  it('passes the session and Last-Event-ID to the stream and returns its body', async () => {
    let seen: { url: string; headers: Headers } | undefined;
    const api = createBridgeApi('http://bridge', (input, init) => {
      seen = { url: urlOf(input), headers: new Headers(init?.headers) };
      return Promise.resolve(new Response('id: 1\n\n', { status: 200 }));
    });
    const response = await api.openSpeechStream('none', '41', new AbortController().signal);
    expect(seen?.url).toBe('http://bridge/api/v1/speech/stream?session=none');
    expect(seen?.headers.get('last-event-id')).toBe('41');
    expect(await response.text()).toBe('id: 1\n\n');
  });

  it('passes the status of a refused stream on and releases its body', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    const api = createBridgeApi('http://bridge', () =>
      Promise.resolve(new Response(body, { status: 404 })),
    );
    await expect(api.openSpeechStream(9, null, new AbortController().signal)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(cancelled).toBe(true);
  });

  it('answers 502 when the stream cannot be opened', async () => {
    const api = createBridgeApi('http://bridge', () => Promise.reject(new Error('ECONNREFUSED')));
    await expect(
      api.openSpeechStream(null, null, new AbortController().signal),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('reads a page of a session with since and limit', async () => {
    let requested = '';
    const api = createBridgeApi(
      'http://bridge',
      fakeFetch((url) => {
        requested = url;
        return json({ entries: [], truncated: false, hasMore: false });
      }),
    );
    const list = await api.speech(4, 10, 500);
    expect(new URL(requested).searchParams.toString()).toBe('since=10&limit=500&session=4');
    expect(list.hasMore).toBe(false);
  });

  it('presses keys with a POST and accepts the empty 204 answer', async () => {
    let seen: { url: string; method: string | undefined; body: unknown } | undefined;
    const api = createBridgeApi('http://bridge', (input, init) => {
      seen = { url: urlOf(input), method: init?.method, body: init?.body };
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await expect(api.pressKeys('Insert+T')).resolves.toBeUndefined();
    expect(seen).toEqual({
      url: 'http://bridge/api/v1/input/keys',
      method: 'POST',
      body: '{"keys":"Insert+T"}',
    });
  });

  it('passes on why keys cannot be pressed', async () => {
    const api = createBridgeApi(
      'http://bridge',
      fakeFetch(() => json({ error: { code: 'INPUT_DISABLED', message: 'only on Windows' } }, 409)),
    );
    await expect(api.pressKeys('Insert+T')).rejects.toMatchObject({
      status: 409,
      body: { message: 'only on Windows' },
    });
  });

  it('posts a marker and returns the entry', async () => {
    const entry = {
      seq: 7,
      kind: 'marker',
      text: 'step 3',
      receivedAt: '2026-01-01T00:00:00.000Z',
      source: 'api',
      voice: null,
      connectionId: null,
      sessionId: null,
    };
    let seen: { url: string; body: unknown } | undefined;
    const api = createBridgeApi('http://bridge', (input, init) => {
      const sent = init?.body;
      seen = { url: urlOf(input), body: JSON.parse(typeof sent === 'string' ? sent : '') };
      return Promise.resolve(json(entry, 201));
    });
    const added = await api.addMarker('step 3');
    expect(seen).toEqual({ url: 'http://bridge/api/v1/markers', body: { label: 'step 3' } });
    expect(added.seq).toBe(7);
  });
});
