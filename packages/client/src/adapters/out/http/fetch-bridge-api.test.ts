import type { SessionDto, SpeechEntryDto, StatusDto } from '@screenreader-speech-capture/shared';
import { describe, expect, it } from 'vitest';
import type { SpeechFeedEvent } from '../../../domain/feed-event.js';
import {
  BridgeHttpError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
} from '../../../domain/errors.js';
import { FetchBridgeApi } from './fetch-bridge-api.js';

interface Call {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake `fetch` that records each call and answers with `respond`. */
function fakeFetch(respond: (call: Call) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: Call = {
      url: input instanceof Request ? input.url : input.toString(),
      method: init?.method,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    return respond(call);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const api = (fetch: typeof globalThis.fetch, baseUrl = () => Promise.resolve('http://vm:5151')) =>
  new FetchBridgeApi({ baseUrl, fetch });

const entryDto: SpeechEntryDto = {
  seq: 1,
  kind: 'speech',
  text: 'OK button',
  receivedAt: '2026-11-12T09:00:00.000Z',
  source: 'tcp',
  voice: null,
  connectionId: 1,
  sessionId: null,
};
const sessionDto: SessionDto = {
  id: 2,
  name: 'login',
  run: null,
  startedAt: '2026-11-12T09:00:00.000Z',
  endedAt: null,
  startSeq: 0,
  firstSeq: null,
  lastSeq: null,
  entries: 0,
};
const statusDto = (apiVersion = '1.4'): StatusDto => ({
  bridge: {
    version: '1.0.0',
    apiVersion,
    state: 'ready',
    startedAt: '2026-11-12T09:00:00.000Z',
  },
  tcp: {
    listening: true,
    host: '127.0.0.1',
    port: 4449,
    encoding: 'windows-1252',
    connections: [{ id: 1, voice: null, connectedAt: '2026-11-12T09:00:00.000Z' }],
  },
  buffer: { size: 0, maxEntries: 10, firstSeq: null, lastSeq: null },
  playwright: { state: 'stopped', version: '1.0.0', port: 3000, restarts: 0, exitCode: null },
  mcp: { state: 'stopped', version: '0.0.1', port: 8931, restarts: 0, exitCode: null },
  session: { current: sessionDto, count: 1 },
});

describe('FetchBridgeApi requests', () => {
  it('lists speech with the query parameters under /api/v1', async () => {
    const { fetch, calls } = fakeFetch(() =>
      json({ entries: [entryDto], truncated: false, hasMore: true }),
    );
    const page = await api(fetch).listSpeech({ since: 3, limit: 10, session: 'current' });
    expect(calls[0]).toMatchObject({
      url: 'http://vm:5151/api/v1/speech?since=3&limit=10&session=current',
      method: 'GET',
    });
    expect(page).toEqual({
      entries: [entryDto],
      truncated: false,
      hasMore: true,
    });
  });

  it('sends JSON bodies with a content type', async () => {
    const { fetch, calls } = fakeFetch(({ url }) =>
      url.endsWith('/markers') ? json({ ...entryDto, kind: 'marker' }, 201) : json(sessionDto, 201),
    );
    const bridge = api(fetch);
    expect((await bridge.mark('step 1')).kind).toBe('marker');
    await bridge.startSession({ name: 'login', run: undefined });
    await bridge.startSession({ name: 'login', run: 'nightly' });
    expect(
      calls.map(({ method, body, headers }) => [method, body, headers['content-type']]),
    ).toEqual([
      ['POST', { label: 'step 1' }, 'application/json'],
      ['POST', { name: 'login' }, 'application/json'],
      ['POST', { name: 'login', run: 'nightly' }, 'application/json'],
    ]);
  });

  it('maps clear, end session and the session list', async () => {
    const { fetch, calls } = fakeFetch(({ method }) =>
      method === 'GET'
        ? json({ sessions: [sessionDto], currentId: 2 })
        : new Response(null, { status: 204 }),
    );
    const bridge = api(fetch);
    await bridge.clear();
    await bridge.endSession();
    expect(await bridge.listSessions()).toEqual({ sessions: [sessionDto], currentId: 2 });
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'DELETE http://vm:5151/api/v1/speech',
      'POST http://vm:5151/api/v1/sessions/end',
      'GET http://vm:5151/api/v1/sessions',
    ]);
  });

  it('maps the status', async () => {
    const { fetch } = fakeFetch(() => json(statusDto()));
    const status = await api(fetch).status();
    expect(status.bridge).toEqual({
      version: '1.0.0',
      apiVersion: '1.4',
      state: 'ready',
      startedAt: '2026-11-12T09:00:00.000Z',
    });
    expect(status.session.current).toEqual(sessionDto);
    expect(status.tcp.connections).toEqual([
      { id: 1, voice: null, connectedAt: '2026-11-12T09:00:00.000Z' },
    ]);
  });

  it('rejects a bridge with another major API version before reading its status', async () => {
    const { fetch } = fakeFetch(() => json({ bridge: { apiVersion: '2.0' } }));
    await expect(api(fetch).status()).rejects.toBeInstanceOf(IncompatibleBridgeError);
  });

  it('accepts a bridge with an older minor API version', async () => {
    const { fetch } = fakeFetch(() => json(statusDto('1.0')));
    expect((await api(fetch).status()).bridge.apiVersion).toBe('1.0');
  });

  it('resolves the base URL once, and again after it failed', async () => {
    const { fetch } = fakeFetch(() => new Response(null, { status: 204 }));
    let calls = 0;
    const bridge = api(fetch, () =>
      ++calls === 1 ? Promise.reject(new Error('bad config')) : Promise.resolve('http://vm:1'),
    );
    await expect(bridge.clear()).rejects.toThrow('bad config');
    await bridge.clear();
    await bridge.clear();
    expect(calls).toBe(2);
  });
});

describe('FetchBridgeApi errors', () => {
  it('turns the bridge error body into a BridgeHttpError', async () => {
    const { fetch } = fakeFetch(() =>
      json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Session 9 does not exist',
            details: { session: 9 },
          },
        },
        404,
      ),
    );
    const error = await api(fetch)
      .listSpeech({ since: 0 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BridgeHttpError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      details: { session: 9 },
      message: 'Session 9 does not exist (HTTP 404, NOT_FOUND)',
    });
  });

  it('keeps an error that is not the bridge format as HTTP_ERROR', async () => {
    const { fetch } = fakeFetch(
      () => new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }),
    );
    await expect(api(fetch).clear()).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_ERROR',
      message: 'Bad Gateway (HTTP 502, HTTP_ERROR)',
    });
  });

  it('wraps a failed connection as BridgeUnreachableError with the URL and cause', async () => {
    const cause = Object.assign(new TypeError('fetch failed'), {
      cause: { code: 'ECONNREFUSED' },
    });
    const { fetch } = fakeFetch(() => Promise.reject(cause));
    const error = await api(fetch)
      .clear()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BridgeUnreachableError);
    expect((error as Error).message).toBe(
      'The bridge at http://vm:5151 is not reachable (ECONNREFUSED)',
    );
  });
});

/** An SSE response that sends `frames`, then stays open until the request is aborted. */
function sse(frames: string[], signal: AbortSignal | null | undefined) {
  // Like real fetch: a request whose signal is already aborted fails at once.
  if (signal?.aborted) return Promise.reject(signal.reason as Error);
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(new TextEncoder().encode(frame));
      signal?.addEventListener('abort', () => controller.error(signal.reason));
    },
  });
  return Promise.resolve(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
}

describe('FetchBridgeApi.streamSpeech', () => {
  it('yields the known events, skips unknown ones, and sends Last-Event-ID', async () => {
    let request: RequestInit | undefined;
    const fetch = ((_url: string, init: RequestInit) => {
      request = init;
      return sse(
        [
          `id: 1\nevent: entry\ndata: ${JSON.stringify(entryDto)}\n\n`,
          `event: session\ndata: ${JSON.stringify(sessionDto)}\n\n`,
          'event: clear\ndata: {}\n\n',
          'event: future\ndata: {}\n\n',
          ': ping\n\n',
          'event: truncated\ndata: {}\n\n',
        ],
        init.signal,
      );
    }) as unknown as typeof globalThis.fetch;
    const controller = new AbortController();
    const events: SpeechFeedEvent[] = [];
    for await (const event of api(fetch).streamSpeech({
      lastEventId: 7,
      signal: controller.signal,
    })) {
      events.push(event);
      if (event.type === 'truncated') controller.abort();
    }
    expect(events.map((e) => e.type)).toEqual(['entry', 'session', 'clear', 'truncated']);
    expect(events[0]).toEqual({ type: 'entry', entry: entryDto });
    expect(request?.headers).toMatchObject({
      accept: 'text/event-stream',
      'last-event-id': '7',
    });
  });

  it('limits the stream to a session', async () => {
    let url: string | undefined;
    const fetch = ((u: string, init: RequestInit) => {
      url = u;
      return sse(['event: clear\ndata: {}\n\n'], init.signal);
    }) as unknown as typeof globalThis.fetch;
    const controller = new AbortController();
    const stream = api(fetch).streamSpeech({
      lastEventId: null,
      session: 3,
      signal: controller.signal,
    });
    await stream.next();
    controller.abort();
    expect(url).toMatch(/\/api\/v1\/speech\/stream\?session=3$/);
  });

  it('ends quietly when the caller aborts', async () => {
    const fetch = ((_url: string, init: RequestInit) =>
      sse([], init.signal)) as unknown as typeof globalThis.fetch;
    const controller = new AbortController();
    const stream = api(fetch).streamSpeech({ lastEventId: null, signal: controller.signal });
    const next = stream.next();
    controller.abort();
    expect(await next).toEqual({ done: true, value: undefined });
  });

  it('reports a dropped stream as unreachable', async () => {
    const fetch = (() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            start: (c) => c.error(new Error('socket hang up')),
          }),
        ),
      )) as unknown as typeof globalThis.fetch;
    const stream = api(fetch).streamSpeech({
      lastEventId: null,
      signal: new AbortController().signal,
    });
    await expect(stream.next()).rejects.toBeInstanceOf(BridgeUnreachableError);
  });

  it('passes an HTTP error on as it is', async () => {
    const { fetch } = fakeFetch(() => json({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404));
    const stream = api(fetch).streamSpeech({
      lastEventId: null,
      signal: new AbortController().signal,
    });
    await expect(stream.next()).rejects.toBeInstanceOf(BridgeHttpError);
  });
});
