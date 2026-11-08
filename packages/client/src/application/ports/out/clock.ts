/** Time for timeouts and polling (driven port). */
export interface Clock {
  /** Milliseconds, only compared with other values of `now()`. */
  now(): number;
  sleep(ms: number): Promise<void>;
}
