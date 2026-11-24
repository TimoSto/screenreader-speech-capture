import { describe, expect, it } from 'vitest';
import { API_PREFIX, checkDto, InputCaptureSchema } from '@screenreader-speech-capture/shared';
import { DisabledInputInjector } from '../src/adapters/out/input/disabled-input-injector.js';
import { RecordingInputInjector } from './fakes.js';
import { send, start } from './helpers.js';

async function post(port: number, path: string, body: unknown, type = 'application/json') {
  return fetch(`http://127.0.0.1:${port}${API_PREFIX}${path}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: JSON.stringify(body),
  });
}

describe('native input API', () => {
  it('clicks at the given point', async () => {
    const inputInjector = new RecordingInputInjector();
    const bridge = await start({}, { inputInjector });
    const res = await post(bridge.httpPort, '/input/click', { x: 640, y: 12 });
    expect(res.status).toBe(204);
    expect(inputInjector.calls).toEqual(['click left 640,12']);
  });

  it('presses a chord and a sequence', async () => {
    const inputInjector = new RecordingInputInjector();
    const bridge = await start({}, { inputInjector });
    expect((await post(bridge.httpPort, '/input/keys', { keys: 'Insert+T' })).status).toBe(204);
    expect(
      (await post(bridge.httpPort, '/input/keys', { keys: ['h', 'h'], delayMs: 0 })).status,
    ).toBe(204);
    expect(inputInjector.calls).toEqual(['down insert', 'tap t', 'up insert', 'tap h', 'tap h']);
  });

  it.each([
    ['/input/click', { x: 'a', y: 1 }, 'x'],
    ['/input/click', { x: 1, y: 1, button: 'back' }, 'button'],
    ['/input/keys', { keys: 'Hyper+T' }, 'keys'],
    ['/input/keys', { keys: 5 }, 'keys'],
    ['/input/keys', { keys: 'a', delayMs: 'x' }, 'delayMs'],
    ['/input/keys', { keys: 'a', capture: 1 }, 'capture'],
    ['/input/keys', { keys: 'a', capture: { quietForMs: 'x' } }, 'capture.quietForMs'],
    ['/input/click', { x: 1, y: 1, capture: { timeoutMs: -1 } }, 'capture.timeoutMs'],
  ])('answers 400 for a bad body on %s', async (path, body, field) => {
    const inputInjector = new RecordingInputInjector();
    const bridge = await start({}, { inputInjector });
    const res = await post(bridge.httpPort, path, body);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST', details: { field } },
    });
    expect(inputInjector.calls).toEqual([]);
  });

  it('requires a JSON content type', async () => {
    const bridge = await start({}, { inputInjector: new RecordingInputInjector() });
    const res = await post(bridge.httpPort, '/input/keys', { keys: 'a' }, 'text/plain');
    expect(res.status).toBe(400);
  });

  it('answers 409 INPUT_DISABLED when input is not available', async () => {
    const bridge = await start({}, { inputInjector: new DisabledInputInjector('no robotjs') });
    for (const [path, body] of [
      ['/input/click', { x: 1, y: 1 }],
      ['/input/keys', { keys: 'a' }],
    ] as const) {
      const res = await post(bridge.httpPort, path, body);
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: { code: 'INPUT_DISABLED', message: 'Native input is not available: no robotjs' },
      });
    }
  });

  it('answers with the speech the keys caused when asked to capture', async () => {
    const inputInjector = new RecordingInputInjector();
    const bridge = await start({}, { inputInjector });
    await send(bridge.tcpPort, 'before\r\n');
    // The speech arrives while the bridge is capturing, as the screen reader's would.
    let spoken: Promise<void> | undefined;
    const original = inputInjector.keyTap.bind(inputInjector);
    inputInjector.keyTap = (key) => {
      spoken = send(bridge.tcpPort, 'Heading level 1, Welcome\r\n');
      return original(key);
    };
    const res = await post(bridge.httpPort, '/input/keys', {
      keys: 'h',
      capture: { quietForMs: 100, firstWithinMs: 2000 },
    });
    await spoken;
    expect(res.status).toBe(200);
    const check = checkDto(InputCaptureSchema, await res.json());
    if (!check.ok) throw new Error(`${check.field}: ${check.message}`);
    expect(check.value).toMatchObject({ status: 'silent', startSeq: 1, omitted: 0 });
    expect(check.value.entries.map((e) => e.text)).toEqual(['Heading level 1, Welcome']);
    expect(inputInjector.calls).toEqual(['tap h']);
  });

  it('answers no-speech for a click nothing announces', async () => {
    const inputInjector = new RecordingInputInjector();
    const bridge = await start({}, { inputInjector });
    const res = await post(bridge.httpPort, '/input/click', {
      x: 5,
      y: 6,
      capture: { firstWithinMs: 50 },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'no-speech',
      startSeq: 0,
      entries: [],
      omitted: 0,
      truncated: false,
    });
    expect(inputInjector.calls).toEqual(['click left 5,6']);
  });

  it('answers 409 INPUT_DISABLED for a capture when input is not available', async () => {
    const bridge = await start({}, { inputInjector: new DisabledInputInjector('no robotjs') });
    const res = await post(bridge.httpPort, '/input/keys', { keys: 'a', capture: {} });
    expect(res.status).toBe(409);
  });
});
