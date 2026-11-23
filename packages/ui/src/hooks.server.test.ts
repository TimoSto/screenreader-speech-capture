import { afterEach, describe, expect, it } from 'vitest';
import { handle, handleError } from './hooks.server';

type Event = Parameters<typeof handle>[0]['event'];

async function run(headers: Record<string, string>, fetch: typeof globalThis.fetch) {
  const event = { request: new Request('http://ui/ui/', { headers }), fetch, locals: {} };
  await handle({
    event: event as unknown as Event,
    resolve: () => Promise.resolve(new Response('ok')),
  });
  return event.locals as App.Locals;
}

describe('handle', () => {
  it('marks a request from the bridge machine as local', async () => {
    expect((await run({ 'x-sr-bridge-local': '1' }, fetch)).local).toBe(true);
    expect((await run({}, fetch)).local).toBe(false);
  });

  it("gives the request a bridge API that calls through the request's own fetch", async () => {
    const requested: string[] = [];
    const locals = await run({}, (input) => {
      requested.push(new Request(input).url);
      return Promise.reject(new Error('offline'));
    });
    await expect(locals.bridge.status()).rejects.toMatchObject({ status: 502 });
    expect(requested).toEqual([expect.stringMatching(/\/api\/v1\/status$/)]);
  });
});

describe('handleError', () => {
  const KEY = Symbol.for('screenreader-speech-capture.ui-logger');
  const global = globalThis as Record<symbol, unknown>;
  type Input = Parameters<typeof handleError>[0];

  function capture(): string[] {
    const lines: string[] = [];
    global[KEY] = { error: (m: string) => lines.push(m), warn: (m: string) => lines.push(m) };
    return lines;
  }
  afterEach(() => {
    delete global[KEY];
  });

  const event = {
    request: new Request('http://ui/ui/api/speech?contains=secret'),
    url: new URL('http://ui/ui/api/speech?contains=secret'),
  };

  it('logs an unexpected error to the bridge log, with the path but not the query', async () => {
    const lines = capture();
    const input = { kind: 'unknown', error: new TypeError('boom'), event } as unknown as Input;
    expect(await handleError(input)).toBeUndefined();
    expect(lines).toEqual(['GET /ui/api/speech: TypeError: boom']);
  });

  it("leaves app errors and SvelteKit's own (a 404) out", async () => {
    const lines = capture();
    await handleError({ kind: 'app', error: { message: 'nope' }, event } as unknown as Input);
    await handleError({
      kind: 'framework',
      error: { status: 404, message: 'Not Found' },
      event,
    } as unknown as Input);
    expect(lines).toEqual([]);
  });
});
