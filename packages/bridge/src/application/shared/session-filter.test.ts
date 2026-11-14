import { describe, expect, it } from 'vitest';
import type { Session } from '../../domain/session.js';
import { resolveSessionFilter } from './session-filter.js';

const current: Session = {
  id: 3,
  name: 'a',
  run: null,
  startedAt: new Date(0),
  endedAt: null,
};
const sessions = (now: Session | null, lastId = 3) => ({
  current: () => now,
  lastId: () => lastId,
});

describe('resolveSessionFilter', () => {
  it('is undefined without a filter', () => {
    expect(resolveSessionFilter(undefined, sessions(current))).toBeUndefined();
  });

  it('resolves current to the current id', () => {
    expect(resolveSessionFilter('current', sessions(current))).toBe(3);
  });

  it('is NOT_FOUND for current when no session is current', () => {
    expect(() => resolveSessionFilter('current', sessions(null))).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }) as Error,
    );
  });

  it('resolves none to null, with or without a current session', () => {
    expect(resolveSessionFilter('none', sessions(current))).toBeNull();
    expect(resolveSessionFilter('none', sessions(null, 0))).toBeNull();
  });

  it('accepts any id given out so far, ended or not', () => {
    expect(resolveSessionFilter(1, sessions(null))).toBe(1);
    expect(resolveSessionFilter(3, sessions(null))).toBe(3);
  });

  it('is NOT_FOUND for an id never given out', () => {
    expect(() => resolveSessionFilter(4, sessions(null))).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND', details: { session: 4 } }) as Error,
    );
  });

  it.each([0, -1, 1.5])('is INVALID_REQUEST for %d', (id) => {
    expect(() => resolveSessionFilter(id, sessions(null))).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST', details: { field: 'session' } }) as Error,
    );
  });
});
