import { describe, expect, it } from 'vitest';
import { parseTheme, toggleTheme } from './theme.js';

describe('theme', () => {
  it('toggles between light and dark', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
  });

  it('parses only the two known themes', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('auto')).toBeNull();
    expect(parseTheme(null)).toBeNull();
  });
});
