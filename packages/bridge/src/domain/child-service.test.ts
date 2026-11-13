import { describe, expect, it } from 'vitest';
import { nextAfterCrash, RESTART_POLICY } from './child-service.js';

describe('nextAfterCrash', () => {
  it('restarts with a growing delay: 1 s, 2 s, 4 s, 8 s', () => {
    const delays = [0, 1, 2, 3].map((before) => nextAfterCrash(before, 100));
    expect(delays).toEqual([
      { action: 'restart', crashesInRow: 1, delayMs: 1000 },
      { action: 'restart', crashesInRow: 2, delayMs: 2000 },
      { action: 'restart', crashesInRow: 3, delayMs: 4000 },
      { action: 'restart', crashesInRow: 4, delayMs: 8000 },
    ]);
  });

  it('fails on the 5th crash in a row', () => {
    expect(nextAfterCrash(4, 100)).toEqual({ action: 'fail', crashesInRow: 5 });
  });

  it('starts a new streak after a stable run', () => {
    expect(nextAfterCrash(4, RESTART_POLICY.stableMs)).toEqual({
      action: 'restart',
      crashesInRow: 1,
      delayMs: 1000,
    });
  });

  it('caps the delay', () => {
    const policy = { ...RESTART_POLICY, maxCrashesInRow: 100 };
    expect(nextAfterCrash(20, 0, policy)).toMatchObject({ delayMs: 30_000 });
  });
});
