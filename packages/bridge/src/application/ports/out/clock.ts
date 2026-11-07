export type TimerHandle = unknown;

/** Time source and timers, so use cases can be tested with a fake clock. */
export interface Clock {
  now(): Date;
  /** High-resolution milliseconds since an arbitrary point (performance.now). */
  monotonicMs(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
