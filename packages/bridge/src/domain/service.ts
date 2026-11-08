// Child services the bridge supervises (docs/operations.md#child-service-crashes).

/** Names of the child services. MCP joins in M3 step 2. */
export type ServiceName = 'playwright';
export const SERVICE_NAMES: readonly ServiceName[] = ['playwright'];

export type ServiceState = 'stopped' | 'starting' | 'running' | 'crashed' | 'failed';

export interface ServiceStatus {
  readonly state: ServiceState;
  /** The version that runs (or will run): the configured one or the bundled default. */
  readonly version: string;
  readonly port: number;
  /** Restarts after crashes since the last start by hand. */
  readonly restarts: number;
  /** Exit code of the last unexpected exit, `null` if there was none. */
  readonly exitCode: number | null;
}

export interface RestartPolicy {
  /** Delay before the first restart. Doubles with every crash in a row. */
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Running at least this long before a crash ends the streak of crashes in a row. */
  readonly stableMs: number;
  /** This many crashes in a row and the service is `failed`. */
  readonly maxCrashesInRow: number;
}

export const RESTART_POLICY: RestartPolicy = {
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  stableMs: 60_000,
  maxCrashesInRow: 5,
};

export type CrashDecision =
  | { readonly action: 'restart'; readonly crashesInRow: number; readonly delayMs: number }
  | { readonly action: 'fail'; readonly crashesInRow: number };

/**
 * What to do after a crash. `crashesInRow` counts the crashes before this one, `ranForMs` is how
 * long the service ran before it crashed.
 */
export function nextAfterCrash(
  crashesInRow: number,
  ranForMs: number,
  policy: RestartPolicy = RESTART_POLICY,
): CrashDecision {
  const streak = (ranForMs >= policy.stableMs ? 0 : crashesInRow) + 1;
  if (streak >= policy.maxCrashesInRow) return { action: 'fail', crashesInRow: streak };
  const delayMs = Math.min(policy.baseDelayMs * 2 ** (streak - 1), policy.maxDelayMs);
  return { action: 'restart', crashesInRow: streak, delayMs };
}
