/** Time for timeouts and polling (driven port). */
export interface Clock {
  /** Milliseconds, only compared with other values of `now()`. */
  now(): number;
  /** Resolves after `ms`, or rejects at once with the abort reason when `signal` aborts. */
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
}
