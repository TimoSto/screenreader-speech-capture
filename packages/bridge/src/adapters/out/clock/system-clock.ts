import { performance } from 'node:perf_hooks';
import type { Clock, TimerHandle } from '../../../application/ports/out/clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  monotonicMs(): number {
    return performance.now();
  }

  setTimeout(callback: () => void, ms: number): TimerHandle {
    return setTimeout(callback, ms);
  }

  clearTimeout(handle: TimerHandle): void {
    clearTimeout(handle as NodeJS.Timeout);
  }
}
