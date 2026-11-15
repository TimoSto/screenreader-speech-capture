import { describe, expect, it } from 'vitest';
import { focusPage } from './focus.js';

const geometry = {
  screenX: 100,
  screenY: 50,
  outerWidth: 1000,
  outerHeight: 800,
  innerWidth: 984,
  innerHeight: 700,
  devicePixelRatio: 1,
};

function setup(evaluated: unknown = geometry) {
  const calls: string[] = [];
  const input = {
    click: (point: { x: number; y: number }) => {
      calls.push(`click ${point.x},${point.y}`);
      return Promise.resolve();
    },
  };
  const page = {
    evaluate: () => Promise.resolve(evaluated),
    reload: () => {
      calls.push('reload');
      return Promise.resolve();
    },
  };
  return { calls, input, page };
}

describe('focusPage', () => {
  it('clicks the top-left corner of the content, then reloads', async () => {
    const { calls, input, page } = setup();
    await focusPage(input, page);
    expect(calls).toEqual(['click 109,143', 'reload']);
  });

  it('neither clicks nor reloads when the geometry is unreadable', async () => {
    const { calls, input, page } = setup({ screenX: 'x' });
    await expect(focusPage(input, page)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});
