import { describe, expect, it } from 'vitest';
import type { SessionDto } from '@screenreader-speech-capture/shared';
import {
  describeSession,
  formatDuration,
  parseScope,
  scopeAfterDelete,
  selectedScope,
} from './sessions.js';

const session = (patch: Partial<SessionDto> = {}): SessionDto => ({
  id: 7,
  name: 'checkout test',
  run: 'nightly-42',
  client: null,
  startedAt: '2026-11-12T09:00:00.000Z',
  endedAt: null,
  startSeq: 0,
  firstSeq: null,
  lastSeq: null,
  entries: 3,
  ...patch,
});

describe('formatDuration', () => {
  it.each([
    [0, '0 s'],
    [4_999, '4 s'],
    [192_000, '3 min 12 s'],
    [3_900_000, '1 h 05 min'],
    [-5_000, '0 s'],
  ])('%i ms is %s', (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe('describeSession', () => {
  it('measures a live session up to now', () => {
    const meta = describeSession(session(), Date.parse('2026-11-12T09:00:12.000Z'));
    expect(meta).toMatchObject({
      id: '#7',
      run: 'nightly-42',
      duration: '12 s',
      entries: '3 entries',
    });
    expect(meta.spoken).toBe('Session 7, live, run nightly-42, 12 s, 3 entries');
  });

  it('measures an ended session up to its end and leaves out a missing run', () => {
    const meta = describeSession(
      session({ run: null, entries: 1, endedAt: '2026-11-12T09:03:12.000Z' }),
      Date.parse('2026-11-12T10:00:00.000Z'),
    );
    expect(meta.duration).toBe('3 min 12 s');
    expect(meta.entries).toBe('1 entry');
    expect(meta.spoken).toBe('Session 7, 3 min 12 s, 1 entry');
  });
});

describe('parseScope', () => {
  it('reads a session id or none', () => {
    expect(parseScope('7')).toBe(7);
    expect(parseScope('none')).toBe('none');
  });

  it('refuses anything else', () => {
    for (const value of [
      '',
      '0',
      '007',
      '-1',
      '1.5',
      '1e3',
      ' 7',
      'abc',
      'None',
      '9007199254740993',
    ]) {
      expect(parseScope(value), value).toBeNull();
    }
  });
});

describe('selectedScope', () => {
  const sessions = [session({ id: 7 }), session({ id: 6, endedAt: '2026-11-12T09:01:00.000Z' })];

  it('takes the requested session if it exists', () => {
    expect(selectedScope('6', sessions, 7)).toBe(6);
  });

  it('follows the current session without a request, or with one that is gone or invalid', () => {
    expect(selectedScope(null, sessions, 7)).toBe(7);
    expect(selectedScope('99', sessions, 7)).toBe(7);
    expect(selectedScope('abc', sessions, 7)).toBe(7);
  });

  it('selects the speech outside sessions when asked, also while a session is current', () => {
    expect(selectedScope('none', sessions, 7)).toBe('none');
  });

  it('falls back to the speech outside sessions when no session is current', () => {
    expect(selectedScope(null, sessions, null)).toBe('none');
    expect(selectedScope('99', sessions, null)).toBe('none');
  });
});

describe('scopeAfterDelete', () => {
  const sessions = [session({ id: 3 }), session({ id: 2 }), session({ id: 1 })];

  it('moves to the next older session', () => {
    expect(scopeAfterDelete(2, sessions)).toBe(1);
    expect(scopeAfterDelete(3, sessions)).toBe(2);
  });

  it('moves to the next newer one when it was the oldest', () => {
    expect(scopeAfterDelete(1, sessions)).toBe(2);
  });

  it('has none left when it was the only one, or is not in the list', () => {
    expect(scopeAfterDelete(1, [session({ id: 1 })])).toBeNull();
    expect(scopeAfterDelete(9, sessions)).toBeNull();
  });
});
