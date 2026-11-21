import { describe, expect, it } from 'vitest';
import { THEMES, parseTheme } from './theme.js';

describe('theme', () => {
  it('parses every known theme', () => {
    for (const { value } of THEMES) expect(parseTheme(value)).toBe(value);
    expect(THEMES.map((t) => t.value)).toEqual([
      'light',
      'dark',
      'high-contrast',
      'dark-high-contrast',
    ]);
  });

  it('rejects anything else', () => {
    expect(parseTheme('auto')).toBeNull();
    expect(parseTheme('High-Contrast')).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });
});
