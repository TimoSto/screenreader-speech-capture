import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from './system-clock.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('SystemClock.sleep', () => {
  it('resolves after the time, on the timers Vitest fakes', async () => {
    let done = false;
    void new SystemClock().sleep(100).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(99);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('rejects with the reason when aborted, before or during the sleep', async () => {
    const clock = new SystemClock();
    const early = new AbortController();
    early.abort(new Error('early'));
    await expect(clock.sleep(100, early.signal)).rejects.toThrow('early');

    const late = new AbortController();
    const sleeping = clock.sleep(100, late.signal);
    late.abort(new Error('late'));
    await expect(sleeping).rejects.toThrow('late');
    expect(vi.getTimerCount()).toBe(0);
  });
});
