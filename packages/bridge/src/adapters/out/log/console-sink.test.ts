import { describe, expect, it } from 'vitest';
import { wantsColour } from './console-sink.js';

describe('wantsColour', () => {
  it('uses colours on a terminal only', () => {
    expect(wantsColour(true, {})).toBe(true);
    expect(wantsColour(false, {})).toBe(false);
    expect(wantsColour(undefined, {})).toBe(false);
  });

  it('honours NO_COLOR and FORCE_COLOR', () => {
    expect(wantsColour(true, { NO_COLOR: '1' })).toBe(false);
    expect(wantsColour(false, { FORCE_COLOR: '1' })).toBe(true);
    expect(wantsColour(false, { FORCE_COLOR: '0' })).toBe(false);
    expect(wantsColour(false, { FORCE_COLOR: '1', NO_COLOR: '1' })).toBe(false);
  });
});
