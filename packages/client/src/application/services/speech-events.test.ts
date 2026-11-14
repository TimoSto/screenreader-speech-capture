import { describe, expect, it, vi } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import { BridgeHttpError } from '../../domain/errors.js';
import type { SpeechFeedEvent } from '../../domain/feed-event.js';
import { speechEvents, type SpeechEventsOptions } from './speech-events.js';

function setup() {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  const deps = { api, clock, ensureCompatible: () => Promise.resolve() };
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
