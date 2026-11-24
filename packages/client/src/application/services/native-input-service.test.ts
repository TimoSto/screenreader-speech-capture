import { describe, expect, it } from 'vitest';
import { FakeBridgeApi, FakeClock, FakePage } from '../../../test/fakes.js';
import {
  BridgeHttpError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from '../../domain/errors.js';
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
  return {
    api,
    clock,
    service: new NativeInputService({ api, random: () => 'abc' }),
  };
}

describe('NativeInputService', () => {
  it('sends the click and the keys, one request each', async () => {
    const { api, service } = setup();
    await service.click({ x: 1, y: 2 });
    await service.click({ x: 3, y: 4 }, { button: 'right' });
    await service.pressKeys(['h', 'h'], { delayMs: 10 });
    expect(api.calls).toEqual(['click left 1,2', 'click right 3,4', 'keys h h delay=10']);
  });

  it('refuses an incompatible bridge', async () => {
    const { api, service } = setup('2.0');
    await expect(service.pressKeys('a')).rejects.toBeInstanceOf(IncompatibleBridgeError);
    expect(api.calls).toEqual(['keys a']);
  });

  it("setFocus lets the bridge bring a test browser's window to the front by a title marker", async () => {
    const { api, service } = setup();
    const page = new FakePage(geometry);
    api.windows = [{ target: 'playwright', pid: 7, titleOf: () => `${page.title} - Chromium` }];
    await service.setFocus(page);
    expect(api.calls).toEqual(['focus playwright "sr-focus-abc"']);
    // The marker was in the title while the bridge looked, then the title came back.
    expect(page.titles).toEqual(['sr-focus-abc', 'Checkout']);
  });

  it('bringToFront answers the window, or null when the bridge cannot focus it', async () => {
    const { api, service } = setup();
    const page = new FakePage(geometry);
    api.windows = [{ target: 'playwright', pid: 7, titleOf: () => `${page.title} - Chromium` }];
    expect(await service.bringToFront(page)).toEqual({
      title: 'sr-focus-abc - Chromium',
      pid: 7,
    });
    api.windows = [];
    expect(await service.bringToFront(page)).toBeNull();
    api.failures = [new BridgeHttpError(409, 'INPUT_DISABLED', 'not on Windows')];
    expect(await service.bringToFront(page)).toBeNull();
    expect(page.title).toBe('Checkout');
  });

  it('setFocus does not click when Windows refused: FOCUS_FAILED propagates', async () => {
    const { api, service } = setup();
    const page = new FakePage(geometry);
    await service.focusMcpBrowser().catch(() => undefined); // passes the version check
    api.failures = [new BridgeHttpError(409, 'FOCUS_FAILED', 'refused')];
    await expect(service.setFocus(page)).rejects.toMatchObject({ code: 'FOCUS_FAILED' });
    expect(api.calls.filter((call) => call.startsWith('click'))).toEqual([]);
    expect(page.title).toBe('Checkout');
  });

  it("focusMcpBrowser brings MCP's browser to the front", async () => {
    const { api, service } = setup();
    api.windows = [{ target: 'mcp', pid: 9, titleOf: () => 'Shop - Chromium' }];
    await expect(service.focusMcpBrowser()).resolves.toEqual({ title: 'Shop - Chromium', pid: 9 });
    expect(api.calls).toEqual(['focus mcp']);
  });

  it('setFocus clicks the title bar from the page geometry', async () => {
    const { api, service } = setup();
    const page = new FakePage(geometry);
    await service.setFocus(page);
    // The bridge has no window for it (a browser it didn't start): the click is the fallback.
    expect(api.calls).toEqual(['focus playwright "sr-focus-abc"', 'click left 600,62']);
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
    expect(api.calls).toEqual(['keys h delay=0']);
    expect(api.captures).toEqual([
      { quietForMs: 100, firstWithinMs: 300, timeoutMs: 2000, settleMs: 50 },
    ]);
  });

  it('recordClick returns an empty recording when nothing is said', async () => {
    const { api, service } = setup();
    const recording = await service.recordClick({ x: 1, y: 2 }, { firstWithin: 100 });
    expect(recording).toEqual({ entries: [], truncated: false, startSeq: 0 });
    expect(api.calls).toEqual(['click left 1,2']);
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
