import { setTimeout } from 'node:timers/promises';
import type { Clock } from '../../../application/ports/out/clock.js';

export class SystemClock implements Clock {
  now(): number {
    return performance.now();
  }

  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    await setTimeout(ms, undefined, signal ? { signal } : undefined);
  }
}
