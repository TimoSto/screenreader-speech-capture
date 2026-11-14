/**
 * Time source of the application: the system clock in production, Vitest fake timers in tests.
 * The application uses it instead of the timer globals (ESLint enforces that).
 */
export interface Clock {
  now(): Date;
  /** Resolves after `ms`, or rejects at once with the abort reason when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
