import { describe, expect, it } from 'vitest';
import { MAX_SESSION_NAME_LENGTH, sessionLabel, summarize, type Session } from './session.js';

const session = (endedAt: Date | null): Session => ({
  id: 1,
  name: 'a',
  run: null,
  client: null,
  startedAt: new Date(0),
  endedAt,
  startSeq: 0,
});

describe('summarize', () => {
  it('adds what the buffer holds of the session', () => {
    expect(summarize(session(null), { firstSeq: 2, lastSeq: 5, entries: 4 })).toEqual({
      ...session(null),
      firstSeq: 2,
      lastSeq: 5,
      entries: 4,
    });
  });
});

describe('sessionLabel', () => {
  it('trims the value', () => {
    expect(sessionLabel('name', '  checkout ')).toBe('checkout');
  });

  it('rejects an empty value, naming the field', () => {
    expect(() => sessionLabel('run', '   ')).toThrow('run: must not be empty');
  });

  it('accepts the maximum length and rejects one more', () => {
    expect(sessionLabel('name', 'x'.repeat(MAX_SESSION_NAME_LENGTH))).toHaveLength(
      MAX_SESSION_NAME_LENGTH,
    );
    expect(() => sessionLabel('name', 'x'.repeat(MAX_SESSION_NAME_LENGTH + 1))).toThrow(
      `name: must be at most ${MAX_SESSION_NAME_LENGTH} characters`,
    );
  });
});
