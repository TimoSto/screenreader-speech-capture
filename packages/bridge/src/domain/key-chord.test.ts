import { describe, expect, it } from 'vitest';
import { AppError } from './errors.js';
import { parseKeyChord } from './key-chord.js';

// The rule itself is tested in packages/shared/src/key-chord.test.ts.
describe('parseKeyChord', () => {
  it('returns the chord of the shared rule', () => {
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
