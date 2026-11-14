// Child services the bridge supervises (docs/usage/operations.md#child-service-crashes).
import type { Config } from './config/index.js';

/** The child services, by the config section each follows. */
export type ServiceName = 'playwright' | 'mcp';

export const SERVICE_NAMES: readonly ServiceName[] = ['playwright', 'mcp'];

/** How the services are named in log lines and errors. */
export const SERVICE_TITLES: Readonly<Record<ServiceName, string>> = {
  playwright: 'Playwright server',
  mcp: 'Playwright MCP',
};

/**
 * Where the child services listen: loopback only. Clients reach them through the bridge's HTTP
 * port, which checks Host and Origin for them like for the API
 * (docs/implementation/decisions.md#the-bridge-is-the-single-way-in).
 */
export const CHILD_HOST = '127.0.0.1';

/** Where and which version a child service runs. `version: null` = the bundled default. */
export interface ServiceSettings {
  readonly host: string;
  readonly port: number;
  readonly version: string | null;
}

/** A service's settings from the config: the Playwright server in the configured version, MCP in the bundled one. */
export function serviceSettings(name: ServiceName, config: Config): ServiceSettings {
  if (name === 'playwright') {
    const { port, version } = config.playwright;
    return { host: CHILD_HOST, port, version };
  }
  return { host: CHILD_HOST, port: config.mcp.port, version: null };
}

/** Where a client's request to a service goes: its port while it runs, otherwise why not. */
export type Reachability = { readonly port: number } | { readonly unavailable: string };

export function reachability(
  name: ServiceName,
  status: Pick<ServiceStatus, 'state' | 'port'>,
  enabled: boolean,
): Reachability {
  if (status.state === 'running') return { port: status.port };
  const title = SERVICE_TITLES[name];
  if (!enabled) return { unavailable: `${title} is disabled` };
  return { unavailable: `${title} is not running (state: ${status.state})` };
}

export type ServiceState = 'stopped' | 'starting' | 'running' | 'crashed' | 'failed';

export interface ServiceStatus {
  readonly state: ServiceState;
  /** The version that runs (or will run): the configured one or the bundled default. */
  readonly version: string;
  readonly port: number;
  /** Restarts after crashes since the service was last started (bridge start or config change). */
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
