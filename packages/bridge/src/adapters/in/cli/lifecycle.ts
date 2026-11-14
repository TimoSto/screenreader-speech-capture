import type { Logger } from '../../../application/ports/out/logger.js';

/** What the lifecycle needs from a running bridge. */
export interface StoppableBridge {
  readonly log: Logger;
  stop(reason?: string): Promise<void>;
}

/** The parts of `process` the lifecycle uses, so tests can pass a fake. */
export interface LifecycleProcess {
  readonly platform: NodeJS.Platform;
  on(event: string, listener: (value: unknown) => void): unknown;
  exit(code: number): void;
}

export interface LifecycleOptions {
  /** How long a shutdown may take before the process exits anyway. Default 10 s. */
  timeoutMs?: number;
  /** Writes out buffered console output. Default: drains stdout and stderr. */
  flush?: () => Promise<void>;
}

const SHUTDOWN_TIMEOUT_MS = 10_000;

/** Ctrl+C, `kill`, closing the console window, and Ctrl+Break on Windows. */
export function shutdownSignals(platform: NodeJS.Platform): NodeJS.Signals[] {
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  if (platform === 'win32') signals.push('SIGBREAK');
  return signals;
}

/** Resolves once everything written to `stream` so far is handed to the OS. */
function drain(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve) => stream.write('', () => resolve()));
}

/** Default `flush`: drains stdout and stderr. The log file is written synchronously. */
export async function flushConsole(): Promise<void> {
  await Promise.all([drain(process.stdout), drain(process.stderr)]);
}

function describeError(error: unknown): string {
  return error instanceof Error ? (error.stack ?? String(error)) : String(error);
}

/**
 * Starts the bridge with `start`, then stops it gracefully and exits the process
 * (docs/usage/operations.md#shutdown):
 *
 * - on a shutdown signal. A second signal exits at once.
 * - on an uncaught exception or unhandled rejection, which is logged with its stack. Exit code 1.
 * - if the shutdown takes longer than `timeoutMs`, it exits anyway with code 1.
 *
 * The exit code is 0 unless something failed. Console output is flushed before exiting.
 *
 * The signal handlers are installed before `start`, so a signal that arrives while the bridge
 * starts is not fatal: the bridge stops as soon as it has started. Resolves once started; rejects
 * like `start`.
 */
export async function runUntilStopped(
  start: () => Promise<StoppableBridge>,
  proc: LifecycleProcess,
  options: LifecycleOptions = {},
): Promise<void> {
  const { timeoutMs = SHUTDOWN_TIMEOUT_MS, flush = flushConsole } = options;
  // Set once `start` resolves. The signal handlers below are installed before that.
  let bridge: StoppableBridge | undefined = undefined;
  /** A signal that arrived before the bridge had started. */
  let early: string | undefined;
  let stopping = false;
  let exiting = false;
  let exitCode = 0;
  let watchdog: NodeJS.Timeout | undefined;

  const exit = (code: number) => {
    // A second exit (watchdog, second signal) while flushing doesn't wait again.
    if (exiting) return proc.exit(code);
    exiting = true;
    void flush()
      .catch(() => undefined)
      .then(() => {
        clearTimeout(watchdog);
        proc.exit(code);
      });
  };

  const shutdown = (running: StoppableBridge, reason: string) => {
    stopping = true;
    watchdog = setTimeout(() => {
      running.log.error(`shutdown did not finish within ${timeoutMs / 1000} s, exiting`);
      exiting = true;
      proc.exit(1);
    }, timeoutMs).unref();
    running.stop(reason).then(
      () => exit(exitCode),
      // stop() has logged what failed.
      () => exit(1),
    );
  };

  for (const signal of shutdownSignals(proc.platform)) {
    proc.on(signal, () => {
      if (bridge === undefined) {
        // Still starting: stop once started, or give up at the second signal.
        if (early === undefined) early = signal;
        else exit(1);
        return;
      }
      if (!stopping) return shutdown(bridge, signal);
      bridge.log.warn(`${signal} again, exiting without waiting`);
      exit(1);
    });
  }

  bridge = await start();
  const running = bridge;

  const crash = (what: string) => (error: unknown) => {
    running.log.error(`${what}: ${describeError(error)}`);
    exitCode = 1;
    if (!stopping) shutdown(running, 'crash');
  };
  proc.on('uncaughtException', crash('uncaught exception'));
  proc.on('unhandledRejection', crash('unhandled rejection'));

  if (early !== undefined) shutdown(running, early);
}
