import { describe, expect, it } from 'vitest';
import { handle } from './hooks.server';

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
