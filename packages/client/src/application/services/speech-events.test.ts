import { describe, expect, it, vi } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import { BridgeHttpError } from '../../domain/errors.js';
import { speechEvents, type SpeechEvent, type SpeechEventsOptions } from './speech-events.js';

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

function show(event: SpeechEvent): string {
  switch (event.type) {
    case 'bridge':
      return `bridge ${event.instanceId}`;
    case 'restarted':
      return `restarted ${event.previousInstanceId} -> ${event.instanceId}`;
    case 'entry':
      return `${event.entry.seq} ${event.entry.text}`;
    default:
      return event.type;
  }
}

describe('speechEvents', () => {
  it("yields each connection's bridge event, then entries; a restart in between", async () => {
    const { api, deps } = setup();
    api.speak('a');
    const retries: Error[] = [];
    const { log, stop } = collect(deps, { since: 0, onRetry: (e) => retries.push(e) });
    await vi.waitFor(() => expect(log).toEqual(['bridge run-1', '1 a']));
    api.restart();
    api.speak('x');
    await vi.waitFor(() =>
      expect(log).toEqual([
        'bridge run-1',
        '1 a',
        'restarted run-1 -> run-2',
        'bridge run-2',
        '1 x',
      ]),
    );
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
