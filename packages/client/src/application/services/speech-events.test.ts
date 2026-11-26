import { describe, expect, it, vi } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import { BridgeHttpError } from '../../domain/errors.js';
import type { SpeechFeedEvent } from '../../domain/feed-event.js';
import { speechEvents, type SpeechEventsOptions } from './speech-events.js';

function setup() {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  const deps = { api, clock };
  return { api, clock, deps };
}

/** Collects the events as short strings until `controller` aborts or the events throw. */
function collect(
  deps: ReturnType<typeof setup>['deps'],
  options: Omit<SpeechEventsOptions, 'signal'>,
) {
  const controller = new AbortController();
  const log: string[] = [];
  const done = (async () => {
    for await (const event of speechEvents(deps, { ...options, signal: controller.signal })) {
      log.push(show(event));
    }
  })();
  return { log, done, stop: () => controller.abort() };
}

function show(event: SpeechFeedEvent): string {
  return event.type === 'entry' ? `${event.entry.seq} ${event.entry.text}` : event.type;
}

describe('speechEvents', () => {
  it('reconnects after Last-Event-ID, also into a restarted bridge', async () => {
    const { api, deps } = setup();
    api.speak('a');
    const retries: Error[] = [];
    const { log, stop } = collect(deps, { since: 0, onRetry: (e) => retries.push(e) });
    await vi.waitFor(() => expect(log).toEqual(['1 a']));
    api.restart();
    api.speak('x');
    await vi.waitFor(() => expect(log).toEqual(['1 a', '1001 x']));
    expect(api.calls.filter((c) => c.startsWith('stream'))).toEqual(['stream 0', 'stream 1']);
    expect(retries).toHaveLength(1);
    stop();
  });

  it('reconnects from the bridge position when the feed dropped before its first entry', async () => {
    const { api, deps } = setup();
    api.speak('old');
    const { log, stop } = collect(deps, { since: null });
    // Connected; the bridge said where it stands, and nothing was spoken yet.
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    api.dropStreams(new Error('network'));
    api.speak('gap');
    await vi.waitFor(() => expect(log).toEqual(['2 gap']));
    // Not `stream null`: that would have lost `gap`.
    expect(api.calls.filter((c) => c.startsWith('stream'))).toEqual(['stream null', 'stream 1']);
    stop();
  });

  it('starts over from the bridge position, not an entry, for a feed with no since', async () => {
    const { api, deps } = setup();
    api.speak('before');
    const { log, stop } = collect(deps, { since: null });
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    api.speak('after');
    await vi.waitFor(() => expect(log).toEqual(['2 after']));
    stop();
  });

  it('gets the whole buffer after a truncated for a cursor above every seq', async () => {
    const { api, deps } = setup();
    api.speak('a', 'b');
    const { log, stop } = collect(deps, { since: 500 });
    await vi.waitFor(() => expect(log).toEqual(['truncated', '1 a', '2 b']));
    stop();
  });

  it('passes the session on and throws a 4xx instead of reconnecting', async () => {
    const { api, deps } = setup();
    const { done } = collect(deps, { since: null, session: 4 });
    await expect(done).rejects.toBeInstanceOf(BridgeHttpError);
    expect(api.calls).toEqual(['stream null session=4']);
  });

  it('ends when aborted while waiting to reconnect', async () => {
    const { api, deps } = setup();
    api.failures = [new Error('network')];
    const { done, stop } = collect(deps, { since: null, onRetry: () => stop() });
    await expect(done).resolves.toBeUndefined();
    expect(api.openStreams).toBe(0);
  });
});
