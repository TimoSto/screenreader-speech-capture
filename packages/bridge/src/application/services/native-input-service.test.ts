import { describe, expect, it } from 'vitest';
import { MemoryLogger, RecordingInputInjector } from '../../../test/fakes.js';
import { NativeInputService } from './native-input-service.js';

function setup() {
  const injector = new RecordingInputInjector();
  const sleeps: number[] = [];
  const logger = new MemoryLogger();
  const clock = {
    sleep: (ms: number) => {
      sleeps.push(ms);
      injector.calls.push(`sleep ${ms}`);
      return Promise.resolve();
    },
  };
  return { injector, sleeps, logger, service: new NativeInputService({ injector, clock, logger }) };
}

describe('NativeInputService', () => {
  it('holds the modifiers while the key is tapped, then releases them in reverse', async () => {
    const { service, injector } = setup();
    await service.pressKeys({ keys: 'Control+Insert+T' });
    expect(injector.calls).toEqual([
      'down control',
      'down insert',
      'tap t',
      'up insert',
      'up control',
    ]);
  });

  it('pauses between the chords of a sequence, not before the first', async () => {
    const { service, injector } = setup();
    await service.pressKeys({ keys: ['h', 'Insert+Down'], delayMs: 20 });
    expect(injector.calls).toEqual(['tap h', 'sleep 20', 'down insert', 'tap down', 'up insert']);
  });

  it('uses the default delay', async () => {
    const { service, sleeps } = setup();
    await service.pressKeys({ keys: ['a', 'b'] });
    expect(sleeps).toEqual([50]);
  });

  it('releases held modifiers when the key fails', async () => {
    const { service, injector } = setup();
    injector.failOn = 't';
    await expect(service.pressKeys({ keys: 'Insert+T' })).rejects.toThrow('cannot tap t');
    expect(injector.calls).toEqual(['down insert', 'up insert']);
  });

  it('checks the whole request before sending anything', async () => {
    const { service, injector } = setup();
    await expect(service.pressKeys({ keys: ['a', 'Bogus'] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(service.pressKeys({ keys: [] })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await expect(service.pressKeys({ keys: 'a', delayMs: -1 })).rejects.toMatchObject({
      details: { field: 'delayMs' },
    });
    expect(injector.calls).toEqual([]);
  });

  it('clicks with the left button by default', async () => {
    const { service, injector } = setup();
    await service.click({ x: 640, y: 12 });
    await service.click({ x: -5, y: 3, button: 'right' });
    expect(injector.calls).toEqual(['click left 640,12', 'click right -5,3']);
  });

  it('rejects bad coordinates and buttons', async () => {
    const { service } = setup();
    await expect(service.click({ x: 1.5, y: 0 })).rejects.toMatchObject({
      details: { field: 'x' },
    });
    await expect(service.click({ x: 0, y: 1e9 })).rejects.toMatchObject({
      details: { field: 'y' },
    });
    await expect(service.click({ x: 0, y: 0, button: 'x' as 'left' })).rejects.toMatchObject({
      details: { field: 'button' },
    });
  });

  it('runs requests one after the other and survives a failure', async () => {
    const { service, injector } = setup();
    const events: string[] = [];
    const slow = injector.keyTap.bind(injector);
    injector.keyTap = async (key) => {
      events.push(`start ${key}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await slow(key);
      events.push(`end ${key}`);
    };
    injector.failOn = 'b';
    const results = await Promise.allSettled([
      service.pressKeys({ keys: 'a' }),
      service.pressKeys({ keys: 'b' }),
      service.pressKeys({ keys: 'c' }),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(events).toEqual(['start a', 'end a', 'start b', 'start c', 'end c']);
  });

  it('runs beforeInject in the queue, right before the input', async () => {
    const { service, injector } = setup();
    const first = service.pressKeys({ keys: 'a' });
    const second = service.click(
      { x: 1, y: 2 },
      { beforeInject: () => void injector.calls.push('before click') },
    );
    await Promise.all([first, second]);
    expect(injector.calls).toEqual(['tap a', 'before click', 'click left 1,2']);
  });

  it('sends nothing when beforeInject rejects', async () => {
    const { service, injector } = setup();
    await expect(
      service.pressKeys({ keys: 'a' }, { beforeInject: () => Promise.reject(new Error('no')) }),
    ).rejects.toThrow('no');
    expect(injector.calls).toEqual([]);
  });

  it('checks the request before beforeInject runs', async () => {
    const { service } = setup();
    let ran = false;
    await expect(
      service.pressKeys({ keys: 'Nope' }, { beforeInject: () => void (ran = true) }),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(ran).toBe(false);
  });
});
