import { describe, expect, it } from 'vitest';
import type { SessionDto } from '@screenreader-speech-capture/shared';
import { canAddMarker, formatReceivedTime, isLiveScope, logHeading } from './speech';

const session = (id: number, name: string): SessionDto => ({
  id,
  name,
  run: null,
  client: null,
  startedAt: '2026-01-01T00:00:00.000Z',
  endedAt: null,
  startSeq: 1,
  firstSeq: null,
  lastSeq: null,
  entries: 0,
});

describe('logHeading', () => {
  it('shows the number and the name of a session', () => {
    expect(logHeading(3, [session(3, 'Checkout flow')])).toBe('#3 Checkout flow');
  });

  it('names the speech outside any session', () => {
    expect(logHeading('none', [])).toBe('Outside sessions');
  });

  it('falls back to the number for a session that is gone', () => {
    expect(logHeading(9, [session(3, 'a')])).toBe('#9');
  });
});

describe('formatReceivedTime', () => {
  it('formats hours, minutes, seconds and milliseconds', () => {
    const iso = new Date(2026, 0, 2, 14, 3, 7, 42).toISOString();
    expect(formatReceivedTime(iso)).toBe('14:03:07.042');
  });

  it('keeps text that is not a date', () => {
    expect(formatReceivedTime('later')).toBe('later');
  });
});

describe('isLiveScope', () => {
  it('is live for the current session and for the speech outside sessions', () => {
    expect(isLiveScope(3, 3)).toBe(true);
    expect(isLiveScope('none', null)).toBe(true);
  });

  it('is not live for an ended session', () => {
    expect(isLiveScope(2, 3)).toBe(false);
    expect(isLiveScope(2, null)).toBe(false);
  });
});

describe('canAddMarker', () => {
  it('is offered in the current session', () => {
    expect(canAddMarker(3, 3)).toBe(true);
  });

  it('is offered outside sessions while no session is current', () => {
    expect(canAddMarker('none', null)).toBe(true);
  });

  it('is not offered outside sessions while a session is current (the marker would land in it)', () => {
    expect(canAddMarker('none', 3)).toBe(false);
  });

  it('is not offered in an ended session', () => {
    expect(canAddMarker(2, 3)).toBe(false);
    expect(canAddMarker(2, null)).toBe(false);
  });
});
