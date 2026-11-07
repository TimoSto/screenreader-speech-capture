export type TimerHandle = unknown;

/**
 * Time source and timers of the application: the system clock in production, Vitest fake timers
 * in tests.
 */
export interface Clock {
  now(): Date;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}
