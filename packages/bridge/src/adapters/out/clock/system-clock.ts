import type { Clock } from '../../../application/ports/out/clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  /** On the global `setTimeout`, so Vitest's fake timers drive it in tests. */
  sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason as Error);
        return;
      }
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal!.reason as Error);
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
