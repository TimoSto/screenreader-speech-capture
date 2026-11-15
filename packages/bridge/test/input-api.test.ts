import { describe, expect, it } from 'vitest';
import { API_PREFIX } from '@screenreader-speech-capture/shared';
import { DisabledInputInjector } from '../src/adapters/out/input/disabled-input-injector.js';
import { RecordingInputInjector } from './fakes.js';
import { start } from './helpers.js';

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
});
