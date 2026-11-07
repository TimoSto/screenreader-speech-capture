import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import { MemorySpeechRepository } from '../../adapters/out/memory/memory-speech-repository.js';
import { AppError } from '../../domain/errors.js';
import { SpeechService } from './speech-service.js';
import { WaitForSpeechService } from './wait-for-speech-service.js';

function setup() {
  const repository = new MemorySpeechRepository(100);
  const events = new InProcessEventBus();
  const speech = new SpeechService({ repository, events, clock: new SystemClock() });
  const waits = new WaitForSpeechService({ repository, events });
  const say = (text: string) => speech.record({ text, voice: null, connectionId: 1 });
  return { speech, waits, say, events };
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
    ).resolves.toMatchObject({ seq: 1, text: 'Submit, button' });
  });

  it('waits for a matching entry that arrives later', async () => {
    const { waits, say } = setup();
    const result = waits.wait({ regex: '^Edit', since: 0, timeoutMs: 1000 });
    say('Submit, button');
    say('Edit, Name');
    await expect(result).resolves.toMatchObject({ seq: 2, text: 'Edit, Name' });
  });

  it('only counts entries after since', async () => {
    const { waits, say } = setup();
    say('Submit');
    const result = waits.wait({ contains: 'submit', normalize: true, since: 1, timeoutMs: 1000 });
    say('SUBMIT  again');
    await expect(result).resolves.toMatchObject({ seq: 2 });
  });

  it('never matches markers', async () => {
    const { waits, speech } = setup();
    const result = settle(waits.wait({ contains: 'step', since: 0, timeoutMs: 1000 }));
    speech.addMarker('step 1');
    await vi.advanceTimersByTimeAsync(1000);
    expect((result.error as AppError).code).toBe('TIMEOUT');
  });

  it('times out with every entry seen after since', async () => {
    const { waits, say } = setup();
    say('one');
    const result = settle(waits.wait({ contains: 'three', since: 0, timeoutMs: 500 }));
    say('two');
    await vi.advanceTimersByTimeAsync(499);
    expect(result.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = result.error as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe('TIMEOUT');
    expect(error.message).toBe('No speech matched "three" within 500 ms');
    expect((error.details!.entries as { text: string }[]).map((e) => e.text)).toEqual([
      'one',
      'two',
    ]);
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

  it('rejects invalid match options', async () => {
    const { waits } = setup();
    await expect(waits.wait({ since: 0, timeoutMs: 1000 })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(waits.wait({ regex: '(', since: 0, timeoutMs: 1000 })).rejects.toMatchObject({
      details: { field: 'regex' },
    });
  });
});
