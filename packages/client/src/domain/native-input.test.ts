import { describe, expect, it } from 'vitest';
import { clickPoint, contentCornerPoint, type WindowGeometry } from './native-input.js';

const window: WindowGeometry = {
  screenX: 100,
  screenY: 50,
  outerWidth: 1000,
  outerHeight: 800,
  innerWidth: 984,
  innerHeight: 700,
  devicePixelRatio: 1,
};

describe('clickPoint', () => {
  it('clicks the middle of the title bar by default', () => {
    expect(clickPoint(window)).toEqual({ x: 600, y: 62 });
  });

  it('clicks the centre of the target, below the browser frame', () => {
    // border 8, frame 800 - 700 - 8 = 92
    expect(clickPoint(window, { x: 10, y: 20, width: 100, height: 40 })).toEqual({
      x: 100 + 8 + 10 + 50,
      y: 50 + 92 + 20 + 20,
    });
  });

  it('turns CSS pixels into physical pixels', () => {
    expect(clickPoint({ ...window, devicePixelRatio: 1.5 })).toEqual({ x: 900, y: 93 });
  });

  it('works for a window left of the primary screen', () => {
    expect(clickPoint({ ...window, screenX: -1100 }).x).toBe(-600);
  });

  it('stays inside a window shorter than the title bar offset', () => {
    expect(clickPoint({ ...window, outerHeight: 10, innerHeight: 10 }).y).toBe(55);
  });

  it('treats a missing ratio as 1', () => {
    expect(clickPoint({ ...window, devicePixelRatio: 0 })).toEqual({ x: 600, y: 62 });
  });
});

describe('contentCornerPoint', () => {
  it('is the top-left of the page, below the browser frame', () => {
    // border 8, frame 92, 1px inside
    expect(contentCornerPoint(window)).toEqual({ x: 100 + 8 + 1, y: 50 + 92 + 1 });
  });

  it('turns CSS pixels into physical pixels', () => {
    expect(contentCornerPoint({ ...window, devicePixelRatio: 2 })).toEqual({ x: 218, y: 286 });
  });
});
