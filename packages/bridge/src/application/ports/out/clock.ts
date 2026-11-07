/** Time source of the application: the system clock in production, Vitest fake timers in tests. */
export interface Clock {
  now(): Date;
}
