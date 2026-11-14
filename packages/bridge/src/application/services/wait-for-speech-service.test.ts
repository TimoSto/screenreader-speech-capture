import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import type { AppError } from '../../domain/errors.js';
import { SpeechLog } from '../../domain/speech-log.js';
import { WAIT_SEEN_LIMIT, WAIT_TIMEOUT_MS } from '../ports/in/wait-for-speech.js';
import type { FollowOptions } from '../shared/follow-log.js';
import { SpeechService } from './speech-service.js';
import { WaitForSpeechService } from './wait-for-speech-service.js';

function setup(maxEntries = 100, pace?: () => FollowOptions['pace']) {
  const log = new SpeechLog(maxEntries);
  const events = new InProcessEventBus();
  const speech = new SpeechService({ log, events, clock: new SystemClock() });
  const waits = new WaitForSpeechService({ log, events, clock: new SystemClock(), pace });
  const say = (text: string) => speech.record({ text, voice: null, connectionId: 1 });
  const startSession = (name: string) => {
    log.startSession({ name, run: null, client: null, startedAt: new Date() });
  };
  return { speech, waits, say, events, startSession };
}

/** The settled value of a promise, without letting a rejection go unhandled. */
function settle<T>(promise: Promise<T>) {
  const result: { value?: T; error?: unknown; done: boolean } = { done: false };
  promise.then(
    (value) => Object.assign(result, { value, done: true }),
    (error: unknown) => Object.assign(result, { error, done: true }),
  );
  return result;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('WaitForSpeechService', () => {
  it('returns a matching entry that is already in the buffer', async () => {
    const { waits, say } = setup();
    say('Submit, button');
    await expect(
      waits.wait({ contains: 'Submit', since: 0, timeoutMs: 1000 }),
    ).resolves.toMatchObject({ status: 'matched', entry: { seq: 1, text: 'Submit, button' } });
  });

  it('waits for a matching entry that arrives later', async () => {
    const { waits, say } = setup();
    const result = waits.wait({ regex: '^Edit', since: 0, timeoutMs: 1000 });
    say('Submit, button');
    say('Edit, Name');
    await expect(result).resolves.toMatchObject({
      status: 'matched',
      entry: { seq: 2, text: 'Edit, Name' },
    });
  });

  it('only counts entries after since', async () => {
    const { waits, say } = setup();
    say('Submit');
    const result = waits.wait({ contains: 'submit', normalize: true, since: 1, timeoutMs: 1000 });
    say('SUBMIT  again');
    await expect(result).resolves.toMatchObject({ status: 'matched', entry: { seq: 2 } });
  });

  it('never matches markers', async () => {
    const { waits, speech } = setup();
    const result = settle(waits.wait({ contains: 'step', since: 0, timeoutMs: 1000 }));
    speech.addMarker('step 1');
    await vi.advanceTimersByTimeAsync(1000);
    expect(result.value).toMatchObject({ status: 'timeout' });
  });

  it('times out with every entry seen after since', async () => {
    const { waits, say } = setup();
    say('one');
    const result = settle(waits.wait({ contains: 'three', since: 0, timeoutMs: 500 }));
    say('two');
    await vi.advanceTimersByTimeAsync(499);
    expect(result.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const timeout = result.value;
    if (timeout?.status !== 'timeout') throw new Error('expected a timeout');
    expect(timeout.seen.map((e) => e.text)).toEqual(['one', 'two']);
    expect(timeout.omitted).toBe(0);
  });

  it('answers a timeout with the last entries seen, and how many came before', async () => {
    const { waits, say } = setup(10_000);
    const total = 2 * WAIT_SEEN_LIMIT + 5;
    for (let i = 0; i < total; i++) say(`t${i}`);
    const result = settle(waits.wait({ contains: 'never', since: 0, timeoutMs: 100 }));
    say('late');
    await vi.advanceTimersByTimeAsync(100);
    const timeout = result.value;
    if (timeout?.status !== 'timeout') throw new Error('expected a timeout');
    expect(timeout.seen).toHaveLength(WAIT_SEEN_LIMIT);
    expect(timeout.seen.at(-1)?.text).toBe('late');
    expect(timeout.seen[0]?.text).toBe(`t${total + 1 - WAIT_SEEN_LIMIT}`);
    expect(timeout.omitted).toBe(total + 1 - WAIT_SEEN_LIMIT);
  });

  describe('with pace', () => {
    /** A `pace` per wait that pauses after its first replayed entry, until `resume()`. */
    function pauser() {
      let release: (() => void) | undefined;
      const pace = () => {
        let calls = 0;
        return () =>
          ++calls === 1 ? new Promise<void>((resolve) => (release = resolve)) : undefined;
      };
      const resume = async () => {
        release?.();
        await vi.advanceTimersByTimeAsync(0);
      };
      return { pace, resume };
    }

    it('finds a match after a pause, and sees entries added meanwhile once, in order', async () => {
      const { pace, resume } = pauser();
      const { waits, say } = setup(100, pace);
      say('one');
      say('two');
      const result = settle(waits.wait({ contains: 'four', since: 0, timeoutMs: 1000 }));
      say('three');
      say('four');
      expect(result.done).toBe(false);
      await resume();
      expect(result.value).toMatchObject({ status: 'matched', entry: { text: 'four', seq: 4 } });
    });

    it('stops looking when it times out while paused', async () => {
      const { pace, resume } = pauser();
      const { waits, say } = setup(100, pace);
      say('one');
      say('two');
      const result = settle(waits.wait({ contains: 'two', since: 0, timeoutMs: 50 }));
      await vi.advanceTimersByTimeAsync(50);
      await resume();
      const timeout = result.value;
      if (timeout?.status !== 'timeout') throw new Error('expected a timeout');
      expect(timeout.seen.map((e) => e.text)).toEqual(['one']);
    });
  });

  it('unsubscribes once a buffered entry matched', async () => {
    const { waits, say, events } = setup();
    say('Submit');
    let active = 0;
    const subscribe = events.subscribe.bind(events);
    vi.spyOn(events, 'subscribe').mockImplementation((listener) => {
      active++;
      const unsubscribe = subscribe(listener);
      return () => {
        active--;
        unsubscribe();
      };
    });
    await expect(
      waits.wait({ contains: 'Submit', since: 0, timeoutMs: 1000 }),
    ).resolves.toMatchObject({ status: 'matched' });
    expect(active).toBe(0);
  });

  it('stops listening when aborted', async () => {
    const { waits, events } = setup();
    const subscribe = vi.spyOn(events, 'subscribe');
    const controller = new AbortController();
    const result = settle(
      waits.wait({ contains: 'x', since: 0, timeoutMs: 1000, signal: controller.signal }),
    );
    controller.abort(new Error('client went away'));
    await vi.advanceTimersByTimeAsync(0);
    expect((result.error as Error).message).toBe('client went away');
    const unsubscribe = subscribe.mock.results[0]!.value as () => boolean;
    expect(unsubscribe()).toBe(false); // already removed
  });

  it('rejects pending and later waits with SERVICE_UNAVAILABLE on shutdown', async () => {
    const { waits } = setup();
    const pending = settle(waits.wait({ contains: 'x', since: 0, timeoutMs: 1000 }));
    waits.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    expect((pending.error as AppError).code).toBe('SERVICE_UNAVAILABLE');
    await expect(waits.wait({ contains: 'x', since: 0, timeoutMs: 1000 })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('defaults since and timeoutMs, and checks their range', async () => {
    const { waits, say } = setup();
    say('Submit');
    await expect(waits.wait({ contains: 'Submit' })).resolves.toMatchObject({
      entry: { seq: 1 },
    });
    const result = settle(waits.wait({ contains: 'never' }));
    await vi.advanceTimersByTimeAsync(WAIT_TIMEOUT_MS.default);
    expect(result.value).toMatchObject({ status: 'timeout' });
    await expect(
      waits.wait({ contains: 'x', timeoutMs: WAIT_TIMEOUT_MS.max + 1 }),
    ).rejects.toMatchObject({ details: { field: 'timeoutMs' } });
  });

  it('rejects invalid match options', async () => {
    const { waits } = setup();
    await expect(waits.wait({ since: 0, timeoutMs: 1000 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(waits.wait({ regex: '(', since: 0, timeoutMs: 1000 })).rejects.toMatchObject({
      details: { field: 'regex' },
    });
  });

  it('only matches entries of the session, resolving current when the wait starts', async () => {
    const { waits, say, startSession } = setup();
    startSession('a');
    say('Submit in a');
    await expect(
      waits.wait({ contains: 'Submit', session: 'current', timeoutMs: 1000 }),
    ).resolves.toMatchObject({ status: 'matched', entry: { seq: 1, sessionId: 1 } });

    const result = settle(waits.wait({ contains: 'Next', session: 'current', timeoutMs: 1000 }));
    startSession('b');
    say('Next in b');
    await vi.advanceTimersByTimeAsync(1000);
    // Only session a's entries were seen, not the one of the session started later.
    const timeout = result.value;
    if (timeout?.status !== 'timeout') throw new Error('expected a timeout');
    expect(timeout.seen.map((e) => e.text)).toEqual(['Submit in a']);
  });

  it('rejects an unknown session with NOT_FOUND', async () => {
    const { waits } = setup();
    await expect(waits.wait({ contains: 'x', session: 'current' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
