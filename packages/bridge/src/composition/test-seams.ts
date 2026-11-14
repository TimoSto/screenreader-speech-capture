import type { LogSink } from '../adapters/out/log/bridge-log.js';
import type { Prepare } from '../adapters/out/process/types.js';
import type { Clock } from '../application/ports/out/clock.js';
import type { ConfigStore } from '../application/ports/out/config-store.js';

/** Replacements tests pass to `startBridge`. Production code leaves them out. */
export interface TestSeams {
  /** The config file. Default: `configFile`, or the default location. */
  configStore?: ConfigStore;
  /**
   * Where the bridge log goes. Default: the console and `config.log.file` (`null`: the default
   * log file).
   */
  sinks?: LogSink[];
  clock?: Clock;
  /** Id of this bridge run (`bridge.instanceId`). Default: a random UUID. */
  instanceId?: string;
  /** Interval of the SSE `: ping` comment. Default 15 s. */
  ssePingMs?: number;
  /** Where Playwright versions are installed. Default: `defaultPlaywrightDir()`. */
  playwrightDir?: string;
  /** Replaces the Playwright install and `run-server` command. */
  playwrightLaunch?: Prepare;
  /** Replaces the MCP Chromium install and command. */
  mcpLaunch?: Prepare;
}
