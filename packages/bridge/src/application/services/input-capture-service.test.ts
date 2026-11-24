import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryLogger, RecordingInputInjector } from '../../../test/fakes.js';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import type { AppError } from '../../domain/errors.js';
import { SpeechLog } from '../../domain/speech-log.js';
import type { InputCaptureResult } from '../ports/in/capture-input.js';
import { InputCaptureService } from './input-capture-service.js';
import { NativeInputService } from './native-input-service.js';
import { SpeechService } from './speech-service.js';

/** An injector that runs `onTap` when a key is tapped, as if the screen reader spoke at once. */
class SpeakingInjector extends RecordingInputInjector {
  onTap: ((key: string) => void) | undefined;
  /** How long a tap takes. */
  tapMs = 0;

  override async keyTap(key: string): Promise<void> {
    this.onTap?.(key);
    if (this.tapMs > 0) await new Promise((resolve) => setTimeout(resolve, this.tapMs));
    return super.keyTap(key);
  }
}

function setup(maxEntries = 100) {
  const clock = new SystemClock();
  const log = new SpeechLog(maxEntries);
  const events = new InProcessEventBus();
  const speech = new SpeechService({ log, events, clock });
  const injector = new SpeakingInjector();
  const input = new NativeInputService({ injector, clock, logger: new MemoryLogger() });
  const captures = new InputCaptureService({ input, log, events, clock });
  const say = (text: string) => speech.record({ text, voice: null, connectionId: 1 });
  return { captures, input, injector, say, speech };
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

const texts = (result: InputCaptureResult | undefined) => result?.entries.map((e) => e.text);

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('InputCaptureService', () => {
  it('records the speech after the input until it pauses', async () => {
    const { captures, say } = setup();
    say('before');
    const result = settle(captures.pressKeys({ keys: 'h', capture: { quietForMs: 500 } }));
    await vi.advanceTimersByTimeAsync(100);
    say('Heading level 1');
    await vi.advanceTimersByTimeAsync(300);
    say('Welcome');
    await vi.advanceTimersByTimeAsync(499);
    expect(result.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.value).toMatchObject({ status: 'silent', startSeq: 1, omitted: 0 });
    expect(texts(result.value)).toEqual(['Heading level 1', 'Welcome']);
  });

  it('reads the start right before the input, in the input queue', async () => {
    const { captures, input, injector, say } = setup();
    // Another request holds the queue; speech while it runs is not this capture's.
    injector.onTap = (key) => {
      if (key === 'a') say('from a');
      if (key === 'h') say('from h');
    };
    void input.pressKeys({ keys: 'a' });
    const result = settle(captures.pressKeys({ keys: 'h', capture: {} }));
    await vi.advanceTimersByTimeAsync(500);
    expect(result.value).toMatchObject({ status: 'silent', startSeq: 1 });
    expect(texts(result.value)).toEqual(['from h']);
  });

  it('counts speech spoken while the input is sent as the first speech', async () => {
    const { captures, injector, say } = setup();
    injector.onTap = () => say('at once');
    const result = settle(captures.pressKeys({ keys: 'h', capture: { quietForMs: 200 } }));
    await vi.advanceTimersByTimeAsync(200);
    expect(result.value).toMatchObject({ status: 'silent' });
    expect(texts(result.value)).toEqual(['at once']);
  });

  it('answers no-speech when nothing is said within firstWithinMs', async () => {
    const { captures, say } = setup();
    const result = settle(
      captures.click({ x: 1, y: 2, capture: { firstWithinMs: 1000, quietForMs: 100 } }),
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(result.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.value).toMatchObject({ status: 'no-speech', entries: [] });
    say('too late');
  });

  it('answers timeout with the speech when it does not pause', async () => {
    const { captures, say } = setup();
    const result = settle(
      captures.pressKeys({ keys: 'h', capture: { quietForMs: 300, timeoutMs: 1000 } }),
    );
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 6; i++) {
      say(`line ${i}`);
      await vi.advanceTimersByTimeAsync(200);
    }
    expect(result.value).toMatchObject({ status: 'timeout' });
    expect(texts(result.value)).toEqual(['line 0', 'line 1', 'line 2', 'line 3', 'line 4']);
  });

  it('times the silence from when the bridge received the speech', async () => {
    const { captures, injector, say } = setup();
    // Spoken 400 ms before the input was sent completely: only 100 ms of silence are left then.
    injector.onTap = () => say('early');
    injector.tapMs = 400;
    const result = settle(captures.pressKeys({ keys: 'h', capture: { quietForMs: 500 } }));
    await vi.advanceTimersByTimeAsync(499);
    expect(result.done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.value).toMatchObject({ status: 'silent' });
  });

  it('leaves markers out', async () => {
    const { captures, speech, say } = setup();
    const result = settle(captures.pressKeys({ keys: 'h', capture: { quietForMs: 100 } }));
    await vi.advanceTimersByTimeAsync(0);
    speech.addMarker('step');
    say('spoken');
    await vi.advanceTimersByTimeAsync(100);
    expect(texts(result.value)).toEqual(['spoken']);
  });

  it('waits for settleMs of silence before the input', async () => {
    const { captures, injector, say } = setup();
    say('trailing');
    const result = settle(
      captures.pressKeys({ keys: 'h', capture: { settleMs: 300, quietForMs: 100 } }),
    );
    await vi.advanceTimersByTimeAsync(200);
    say('still trailing');
    await vi.advanceTimersByTimeAsync(299);
    expect(injector.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(injector.calls).toEqual(['tap h']);
    say('after h');
    await vi.advanceTimersByTimeAsync(100);
    expect(result.value).toMatchObject({ status: 'silent', startSeq: 2 });
    expect(texts(result.value)).toEqual(['after h']);
  });

  it('sends the input after timeoutMs when the speech does not settle', async () => {
    const { captures, injector, say } = setup();
    say('busy');
    void captures.pressKeys({ keys: 'h', capture: { settleMs: 300, timeoutMs: 1000 } });
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(200);
      say('busy');
    }
    expect(injector.calls).toEqual(['tap h']);
  });

  it('does not wait to settle when the last speech is old enough', async () => {
    const { captures, injector, say } = setup();
    say('long ago');
    await vi.advanceTimersByTimeAsync(1000);
    void captures.pressKeys({ keys: 'h', capture: { settleMs: 300 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(injector.calls).toEqual(['tap h']);
  });

  it('keeps the first entries and counts the rest', async () => {
    const { captures, injector, say } = setup(20_000);
    injector.onTap = () => {
      for (let i = 0; i < 10_002; i++) say(`line ${i}`);
    };
    const result = settle(captures.pressKeys({ keys: 'h', capture: { quietForMs: 10 } }));
    await vi.advanceTimersByTimeAsync(10);
    expect(result.value?.entries).toHaveLength(10_000);
    expect(result.value?.entries[0]?.text).toBe('line 0');
    expect(result.value?.omitted).toBe(2);
  });

  it('reports entries dropped from the full buffer', async () => {
    const { captures, injector, say } = setup(2);
    injector.onTap = () => {
      for (let i = 0; i < 3; i++) say(`line ${i}`);
    };
    const result = settle(captures.pressKeys({ keys: 'h', capture: { quietForMs: 10 } }));
    await vi.advanceTimersByTimeAsync(10);
    expect(result.value).toMatchObject({ truncated: true });
    expect(texts(result.value)).toEqual(['line 1', 'line 2']);
  });

  it('rejects bad options before sending anything', async () => {
    const { captures, injector } = setup();
    await expect(
      captures.pressKeys({ keys: 'h', capture: { quietForMs: 0 } }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST', details: { field: 'capture.quietForMs' } });
    await expect(
      captures.pressKeys({ keys: 'h', capture: { timeoutMs: 300_001 } }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(captures.pressKeys({ keys: 'Nope', capture: {} })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    expect(injector.calls).toEqual([]);
  });

  it('stops when the signal aborts', async () => {
    const { captures } = setup();
    const controller = new AbortController();
    const result = settle(
      captures.pressKeys({ keys: 'h', capture: {}, signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error('client gone'));
    await vi.advanceTimersByTimeAsync(0);
    expect((result.error as Error).message).toBe('client gone');
  });

  it('does not send the input when aborted while settling', async () => {
    const { captures, injector, say } = setup();
    say('trailing');
    const controller = new AbortController();
    const result = settle(
      captures.pressKeys({
        keys: 'h',
        capture: { settleMs: 1000 },
        signal: controller.signal,
      }),
    );
    await vi.advanceTimersByTimeAsync(100);
    controller.abort(new Error('client gone'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(result.done).toBe(true);
    expect(injector.calls).toEqual([]);
  });

  it('answers SERVICE_UNAVAILABLE on shutdown, also for later captures', async () => {
    const { captures } = setup();
    const result = settle(captures.pressKeys({ keys: 'h', capture: {} }));
    await vi.advanceTimersByTimeAsync(100);
    captures.shutdown();
    await vi.advanceTimersByTimeAsync(0);
    expect((result.error as AppError).code).toBe('SERVICE_UNAVAILABLE');
    await expect(captures.click({ x: 1, y: 1, capture: {} })).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
