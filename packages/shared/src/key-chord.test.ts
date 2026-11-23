import { describe, expect, it } from 'vitest';
import { parseKeyChord } from './key-chord.js';

describe('parseKeyChord', () => {
  it('splits modifiers from the last key, case-insensitive', () => {
    expect(parseKeyChord('Insert+T')).toEqual({
      ok: true,
      chord: { modifiers: ['insert'], key: 't' },
    });
    expect(parseKeyChord('Control+SHIFT+Home')).toEqual({
      ok: true,
      chord: { modifiers: ['control', 'shift'], key: 'home' },
    });
  });

  it('takes a single key, also a modifier, as a chord of that key', () => {
    expect(parseKeyChord('h')).toEqual({ ok: true, chord: { modifiers: [], key: 'h' } });
    expect(parseKeyChord('CapsLock')).toEqual({
      ok: true,
      chord: { modifiers: [], key: 'capslock' },
    });
  });

  it('holds Insert and CapsLock as modifiers', () => {
    expect(parseKeyChord('CapsLock+Down')).toMatchObject({ chord: { modifiers: ['capslock'] } });
  });

  it('accepts aliases', () => {
    expect(parseKeyChord('Ctrl+Esc')).toEqual({
      ok: true,
      chord: { modifiers: ['control'], key: 'escape' },
    });
  });

  it.each([
    ['', 'unknown key ""'],
    ['Insert+', 'unknown key ""'],
    ['+T', 'unknown key ""'],
    ['Hyper+T', 'unknown key "Hyper" in "Hyper+T"'],
    ['Insert+Insert', 'repeats a key'],
    ['Shift+Shift+a', 'repeats a key'],
    ['T+Insert', '"t" in "T+Insert" is not a modifier'],
    ['a+b', 'is not a modifier'],
  ])('rejects "%s"', (chord, message) => {
    const result = parseKeyChord(chord);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain(message);
  });
});
