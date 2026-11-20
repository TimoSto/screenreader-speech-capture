import { describe, expect, it } from 'vitest';
import type { SessionDto } from '@screenreader-speech-capture/shared';
import { describeSession, formatDuration, selectedSessionId } from './sessions.js';

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
    expect(meta).toMatchObject({ id: '#7', run: 'nightly-42', duration: '12 s', entries: 3 });
    expect(meta.spoken).toBe('Session 7, live, run nightly-42, 12 s, 3 entries');
  });

  it('measures an ended session up to its end and leaves out a missing run', () => {
    const meta = describeSession(
      session({ run: null, entries: 1, endedAt: '2026-11-12T09:03:12.000Z' }),
      Date.parse('2026-11-12T10:00:00.000Z'),
    );
    expect(meta.duration).toBe('3 min 12 s');
    expect(meta.spoken).toBe('Session 7, 3 min 12 s, 1 entry');
  });
});

describe('selectedSessionId', () => {
  const sessions = [session({ id: 7 }), session({ id: 6, endedAt: '2026-11-12T09:01:00.000Z' })];

  it('takes the requested session if it exists', () => {
    expect(selectedSessionId('6', sessions, 7)).toBe(6);
  });

  it('follows the current session without a request, or with one that is gone or invalid', () => {
    expect(selectedSessionId(null, sessions, 7)).toBe(7);
    expect(selectedSessionId('99', sessions, 7)).toBe(7);
    expect(selectedSessionId('abc', sessions, 7)).toBe(7);
  });

  it('selects nothing when no session is current and none is requested', () => {
    expect(selectedSessionId(null, sessions, null)).toBeNull();
  });
});
