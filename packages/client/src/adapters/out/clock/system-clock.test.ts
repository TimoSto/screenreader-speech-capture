import { describe, expect, it } from 'vitest';
import { SystemClock } from './system-clock.js';

describe('SystemClock', () => {
  it('sleeps at least the given time on a monotonic clock', async () => {
    const clock = new SystemClock();
    const start = clock.now();
    await clock.sleep(20);
    expect(clock.now() - start).toBeGreaterThanOrEqual(19);
  });

  it('stops sleeping when the signal aborts', async () => {
    const controller = new AbortController();
    const sleeping = new SystemClock().sleep(60_000, controller.signal);
    controller.abort();
    await expect(sleeping).rejects.toMatchObject({ name: 'AbortError' });
  });
});
