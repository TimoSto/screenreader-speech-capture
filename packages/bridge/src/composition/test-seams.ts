import type { LogSink } from '../adapters/out/log/bridge-log.js';
import type { Prepare } from '../adapters/out/process/types.js';
import type { Clock } from '../application/ports/out/clock.js';
import type { InputInjector } from '../application/ports/out/input-injector.js';
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
  /** Replaces native input (`@jitsi/robotjs`). */
  inputInjector?: InputInjector;
  /** Interval of the SSE `: ping` comment. Default 15 s. */
  ssePingMs?: number;
  /** Where Playwright versions are installed. Default: `defaultPlaywrightDir()`. */
  playwrightDir?: string;
  /** Replaces the Playwright install and `run-server` command. */
  playwrightLaunch?: Prepare;
  /**
   * Where the web UI build is. Default: `ui/` next to the bundled CLI, which doesn't exist when
   * the bridge runs from source, so tests have no UI unless they set this.
   */
  uiDir?: URL;
  /** Replaces the MCP Chromium install and command. */
  mcpLaunch?: Prepare;
}
