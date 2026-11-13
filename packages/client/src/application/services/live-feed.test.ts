import { describe, expect, it, vi } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import { checkApiVersion } from '../../domain/api-version.js';
import {
  BridgeHttpError,
  BridgeRestartedError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
} from '../../domain/errors.js';
import type { OnSpeechOptions } from '../ports/in/speech-capture.js';
import { startLiveFeed, type LiveFeedDeps } from './live-feed.js';

function setup() {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  const deps: LiveFeedDeps = {
    api,
    clock,
    ensureCompatible: async () => {
      checkApiVersion((await api.status()).bridge.apiVersion, '1.4');
    },
  };
  return { api, clock, deps };
}

/** Subscribes and logs everything the feed reports, as short strings. */
function subscribe(deps: LiveFeedDeps, options: OnSpeechOptions = {}) {
  const log: string[] = [];
  const errors: { error: Error; retrying: boolean }[] = [];
  const stop = startLiveFeed(deps, (entry) => log.push(`${entry.seq} ${entry.text}`), {
    onClear: () => log.push('clear'),
    onTruncated: () => log.push('truncated'),
    onError: (error, { retrying }) => errors.push({ error, retrying }),
    ...options,
  });
  return { log, errors, stop };
}

describe('live feed', () => {
  it('checks the version, then delivers live speech and clears', async () => {
    const { api, deps } = setup();
    api.speak('before');
    const { log, errors } = subscribe(deps);
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    expect(api.calls).toEqual(['status', 'stream null']);
    api.speak('Submit, button');
    await api.mark('step');
    await api.clear();
    api.speak('after');
    await vi.waitFor(() => expect(log).toEqual(['2 Submit, button', 'clear', '4 after']));
    expect(errors).toEqual([]);
  });

  it('reports sessions that start and end', async () => {
    const { api, deps } = setup();
    const { log } = subscribe(deps, {
      onSession: (s) => log.push(`session ${s.id} ${s.endedAt === null ? 'started' : 'ended'}`),
    });
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    await api.startSession({ name: 'one' });
    api.speak('hello');
    await api.endSession();
    await vi.waitFor(() =>
      expect(log).toEqual(['session 1 started', '1 hello', 'session 1 ended']),
    );
  });

  it('delivers markers with includeMarkers and replays the buffer with since', async () => {
    const { api, deps } = setup();
    api.speak('one');
    await api.mark('step');
    api.speak('two');
    const { log } = subscribe(deps, { since: 1, includeMarkers: true });
    await vi.waitFor(() => expect(log).toEqual(['2 step', '3 two']));
    expect(api.calls).toContain('stream 1');
    api.emit({ type: 'truncated' });
    await vi.waitFor(() => expect(log).toEqual(['2 step', '3 two', 'truncated']));
  });

  it('reconnects after a lost connection from the last seq, losing and repeating nothing', async () => {
    const { api, clock, deps } = setup();
    const { log, errors } = subscribe(deps);
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    api.speak('a', 'b');
    await vi.waitFor(() => expect(log).toEqual(['1 a', '2 b']));
    const lost = new BridgeUnreachableError('http://vm:5151');
    api.dropStreams(lost);
    api.speak('c'); // while the feed is down
    await vi.waitFor(() => expect(log).toEqual(['1 a', '2 b', '3 c']));
    expect(api.calls).toContain('stream 2');
    expect(errors).toEqual([{ error: lost, retrying: true }]);
    expect(clock.sleeps).toEqual([250]);
  });

  it("reports a bridge restart and starts from the new bridge's first entry", async () => {
    const { api, deps } = setup();
    const { log, errors } = subscribe(deps);
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    api.speak('a', 'b');
    await vi.waitFor(() => expect(log).toEqual(['1 a', '2 b']));
    api.restart();
    // Already past the old seq 2: a replay after Last-Event-ID 2 would skip x and y.
    api.speak('x', 'y', 'z');
    await vi.waitFor(() => expect(log).toEqual(['1 a', '2 b', '1 x', '2 y', '3 z']));
    expect(api.calls.filter((c) => c.startsWith('stream'))).toEqual([
      'stream null',
      'stream 2',
      'stream 0',
    ]);
    const restart = errors.find((e) => e.error instanceof BridgeRestartedError);
    expect(restart).toMatchObject({ retrying: true });
    expect(restart!.error).toMatchObject({ previousInstanceId: 'run-1', instanceId: 'run-2' });
  });

  it('does not report a restart on a reconnect to the same bridge', async () => {
    const { api, deps } = setup();
    const { log, errors } = subscribe(deps);
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    api.speak('a');
    await vi.waitFor(() => expect(log).toEqual(['1 a']));
    api.dropStreams(new Error('network'));
    api.speak('b');
    await vi.waitFor(() => expect(log).toEqual(['1 a', '2 b']));
    expect(errors.some((e) => e.error instanceof BridgeRestartedError)).toBe(false);
  });

  it('backs off exponentially while the bridge is unreachable', async () => {
    const { api, clock, deps } = setup();
    api.failures = Array.from({ length: 6 }, () => new BridgeUnreachableError('http://vm:5151'));
    const { errors } = subscribe(deps);
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    expect(clock.sleeps).toEqual([250, 500, 1000, 2000, 4000, 5000]);
    expect(errors.every((e) => e.retrying)).toBe(true);
  });

  it('stops for good on an incompatible bridge', async () => {
    const { api, deps } = setup();
    api.apiVersion = '2.0';
    const { errors } = subscribe(deps);
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toMatchObject({ retrying: false });
    expect(errors[0]!.error).toBeInstanceOf(IncompatibleBridgeError);
  });

  it('stops for good when the stream answers with a 4xx', async () => {
    const { api, deps } = setup();
    api.failures = [new BridgeHttpError(404, 'NOT_FOUND', 'nope')];
    const { errors } = subscribe({ ...deps, ensureCompatible: () => Promise.resolve() });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    expect(errors[0]).toMatchObject({ retrying: false });
    expect(api.calls).toEqual(['stream null']);
    expect(api.openStreams).toBe(0);
  });

  it('reports a throwing listener and goes on', async () => {
    const { api, deps } = setup();
    const errors: boolean[] = [];
    const seen: string[] = [];
    startLiveFeed(
      deps,
      (entry) => {
        seen.push(entry.text);
        if (entry.text === 'bad') throw new Error('listener bug');
      },
      { onError: (_e, { retrying }) => errors.push(retrying) },
    );
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    api.speak('bad', 'good');
    await vi.waitFor(() => expect(seen).toEqual(['bad', 'good']));
    expect(errors).toEqual([true]);
  });

  it('unsubscribing closes the feed', async () => {
    const { api, deps } = setup();
    const { log, errors, stop } = subscribe(deps);
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    stop();
    stop();
    await vi.waitFor(() => expect(api.openStreams).toBe(0));
    api.speak('late');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(log).toEqual([]);
    expect(errors).toEqual([]);
  });
});
