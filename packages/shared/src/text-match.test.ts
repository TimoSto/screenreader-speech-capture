import { describe, expect, it } from 'vitest';
import { createTextTest, normalizeText } from './text-match.js';

describe('normalizeText', () => {
  it('lowercases, collapses whitespace and trims', () => {
    expect(normalizeText('  Submit,\t\n BUTTON ')).toBe('submit, button');
    expect(normalizeText('  A\r\n  b  ')).toBe('a b');
  });
});

describe('createTextTest', () => {
  it('matches a substring, case-sensitive unless normalize', () => {
    expect(createTextTest('Submit', false)?.('Form  Submit, button')).toBe(true);
    expect(createTextTest('submit', false)?.('Submit, button')).toBe(false);
    expect(createTextTest('SUBMIT,   Button ', true)?.('Form submit,\tbutton')).toBe(true);
  });

  it('a regex keeps its flags, drops g/y state, and gets i with normalize', () => {
    const global = createTextTest(/button/gy, false);
    expect(global?.('button')).toBe(true);
    expect(global?.('button')).toBe(true);
    expect(createTextTest(/^edit/, false)?.('Edit')).toBe(false);
    expect(createTextTest(/^edit/, true)?.('  Edit')).toBe(true);
    expect(createTextTest(/^Edit, \w+/u, false)?.('Edit, Name, blank')).toBe(true);
  });

  it('returns undefined for an empty substring', () => {
    expect(createTextTest('', false)).toBeUndefined();
    expect(createTextTest('   ', true)).toBeUndefined();
    expect(createTextTest(' ', false)).toBeDefined();
  });
});
