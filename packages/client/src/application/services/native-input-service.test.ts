import { describe, expect, it } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import { IncompatibleBridgeError, SpeechTimeoutError } from '../../domain/errors.js';
import { FocusError } from '../../domain/native-input.js';
import { NativeInputService } from './native-input-service.js';

const geometry = {
  screenX: 100,
  screenY: 50,
  outerWidth: 1000,
  outerHeight: 800,
  innerWidth: 984,
  innerHeight: 700,
  devicePixelRatio: 1,
};

function setup(apiVersion = '1.14') {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  api.clock = clock;
  api.apiVersion = apiVersion;
  return { api, clock, service: new NativeInputService({ api, apiVersion: '1.14' }) };
}

describe('NativeInputService', () => {
  it('checks the version once, then sends the click and the keys', async () => {
    const { api, service } = setup();
    await service.click({ x: 1, y: 2 });
    await service.click({ x: 3, y: 4 }, { button: 'right' });
    await service.pressKeys(['h', 'h'], { delayMs: 10 });
    expect(api.calls).toEqual(['status', 'click left 1,2', 'click right 3,4', 'keys h h delay=10']);
  });

  it('refuses an incompatible bridge', async () => {
    const { api, service } = setup('2.0');
    await expect(service.pressKeys('a')).rejects.toBeInstanceOf(IncompatibleBridgeError);
    expect(api.calls).toEqual(['status']);
  });

  it('setFocus clicks the title bar from the page geometry', async () => {
    const { api, service } = setup();
    const page = { evaluate: () => Promise.resolve(geometry) };
    await service.setFocus(page);
    expect(api.calls).toContain('click left 600,62');
  });

  it('setFocus clicks the centre of the target', async () => {
    const { api, service } = setup();
    const page = { evaluate: () => Promise.resolve(geometry) };
    const target = { boundingBox: () => Promise.resolve({ x: 10, y: 20, width: 100, height: 40 }) };
    await service.setFocus(page, { target });
    expect(api.calls).toContain('click left 168,182');
  });

  it('setFocus fails clearly for a hidden target or an odd page', async () => {
    const { api, service } = setup();
    const target = { boundingBox: () => Promise.resolve(null) };
    await expect(
      service.setFocus({ evaluate: () => Promise.resolve(geometry) }, { target }),
    ).rejects.toBeInstanceOf(FocusError);
    await expect(
      service.setFocus({ evaluate: () => Promise.resolve({ screenX: 'x' }) }),
    ).rejects.toBeInstanceOf(FocusError);
    expect(api.calls.filter((call) => call.startsWith('click'))).toEqual([]);
  });

  it('recordKeys sends the keys with a capture and returns the speech after them', async () => {
    const { api, service } = setup();
    api.speak('earlier');
    const pressKeys = api.pressKeys.bind(api);
    api.pressKeys = (request) => pressKeys(request).then(() => api.speak('Heading level 1'));
    const recording = await service.recordKeys('h', {
      delayMs: 0,
      quietFor: 100,
      firstWithin: 300,
      timeout: 2000,
      settle: 50,
    });
    expect(recording).toMatchObject({ startSeq: 1, truncated: false });
    expect(recording.entries.map((e) => e.text)).toEqual(['Heading level 1']);
    expect(api.calls).toEqual(['status', 'keys h delay=0']);
    expect(api.captures).toEqual([
      { quietForMs: 100, firstWithinMs: 300, timeoutMs: 2000, settleMs: 50 },
    ]);
  });

  it('recordClick returns an empty recording when nothing is said', async () => {
    const { api, service } = setup();
    const recording = await service.recordClick({ x: 1, y: 2 }, { firstWithin: 100 });
    expect(recording).toEqual({ entries: [], truncated: false, startSeq: 0 });
    expect(api.calls).toEqual(['status', 'click left 1,2']);
  });

  it('rejects with SpeechTimeoutError and the speech when it does not pause', async () => {
    const { api, clock, service } = setup();
    for (let t = 0; t < 2000; t += 50) clock.at(t, () => api.speak(`tick ${t}`));
    const error = await service
      .recordKeys('h', { quietFor: 100, timeout: 500 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechTimeoutError);
    expect((error as SpeechTimeoutError).message).toBe(
      'Speech did not pause for 100 ms within 500 ms',
    );
    expect((error as SpeechTimeoutError).entries.length).toBeGreaterThan(5);
  });
});
