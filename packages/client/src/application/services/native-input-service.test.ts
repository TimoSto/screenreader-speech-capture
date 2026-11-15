import { describe, expect, it } from 'vitest';
import { FakeBridgeApi } from '../../../test/fakes.js';
import { IncompatibleBridgeError } from '../../domain/errors.js';
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
  api.apiVersion = apiVersion;
  return { api, service: new NativeInputService({ api, apiVersion: '1.14' }) };
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
});
