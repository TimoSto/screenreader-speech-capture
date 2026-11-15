import { describe, expect, it } from 'vitest';
import { AppError } from './errors.js';
import { parseKeyChord } from './key-chord.js';

describe('parseKeyChord', () => {
  it('splits modifiers from the last key, case-insensitive', () => {
    expect(parseKeyChord('Insert+T')).toEqual({ modifiers: ['insert'], key: 't' });
    expect(parseKeyChord('Control+SHIFT+Home')).toEqual({
      modifiers: ['control', 'shift'],
      key: 'home',
    });
  });

  it('takes a single key, also a modifier, as a chord of that key', () => {
    expect(parseKeyChord('h')).toEqual({ modifiers: [], key: 'h' });
    expect(parseKeyChord('CapsLock')).toEqual({ modifiers: [], key: 'capslock' });
  });

  it('holds Insert and CapsLock as modifiers', () => {
    expect(parseKeyChord('CapsLock+Down').modifiers).toEqual(['capslock']);
  });

  it('accepts aliases', () => {
    expect(parseKeyChord('Ctrl+Esc')).toEqual({ modifiers: ['control'], key: 'escape' });
  });

  it.each(['', 'Insert+', '+T', 'Hyper+T', 'Insert+Insert', 'T+Insert', 'a+b', 'Shift+Shift+a'])(
    'rejects "%s"',
    (chord) => {
      expect(() => parseKeyChord(chord)).toThrow(AppError);
      try {
        parseKeyChord(chord);
      } catch (error) {
        expect(error).toMatchObject({ code: 'INVALID_REQUEST', details: { field: 'keys' } });
      }
    },
  );
});
