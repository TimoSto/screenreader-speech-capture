import { describe, expect, it } from 'vitest';
import { RobotjsInputInjector } from './robotjs-input-injector.js';

function setup() {
  const calls: string[] = [];
  const injector = new RobotjsInputInjector({
    moveMouse: (x, y) => void calls.push(`move ${x},${y}`),
    mouseClick: (button) => void calls.push(`mouse ${button}`),
    keyToggle: (key, down) => void calls.push(`toggle ${key} ${down}`),
    keyTap: (key) => void calls.push(`tap ${key}`),
  });
  return { calls, injector };
}

describe('RobotjsInputInjector', () => {
  it('moves, then clicks', async () => {
    const { calls, injector } = setup();
    await injector.click(10, 20, 'right');
    expect(calls).toEqual(['move 10,20', 'mouse right']);
  });

  it('toggles and taps keys, spelling the Windows key like robotjs', async () => {
    const { calls, injector } = setup();
    await injector.keyDown('insert');
    await injector.keyTap('t');
    await injector.keyUp('insert');
    await injector.keyTap('win');
    expect(calls).toEqual(['toggle insert down', 'tap t', 'toggle insert up', 'tap command']);
  });

  it('rejects when robotjs throws', async () => {
    const injector = new RobotjsInputInjector({
      moveMouse: () => undefined,
      mouseClick: () => undefined,
      keyToggle: () => undefined,
      keyTap: () => {
        throw new Error('boom');
      },
    });
    await expect(injector.keyTap('a')).rejects.toThrow('boom');
  });
});
