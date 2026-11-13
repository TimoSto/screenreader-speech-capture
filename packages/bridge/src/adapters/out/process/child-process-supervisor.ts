import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { Logger } from '../../../application/ports/out/logger.js';
import type {
  ProcessSupervisor,
  ServiceSettings,
} from '../../../application/ports/out/process-supervisor.js';
import {
  nextAfterCrash,
  type RestartPolicy,
  type ServiceState,
  type ServiceStatus,
} from '../../../domain/child-service.js';
import { hostPort, isWildcard, reachableUrls } from '../../shared/net/reachable-urls.js';
import { killTree, pipeLines, treeSpawnOptions } from './process-tree.js';

/** A program to run, without a shell. */
export interface Command {
  readonly command: string;
  readonly args: readonly string[];
}

/** The settings with the version resolved (the configured one or the default). */
export interface ResolvedSettings {
  readonly host: string;
  readonly port: number;
  readonly version: string;
}

/**
 * Gets the service ready to run (for example installs it) and returns its command. A rejection
 * counts as a crash. `signal` aborts when the service is stopped meanwhile.
 */
export type Prepare = (settings: ResolvedSettings, signal: AbortSignal) => Promise<Command>;

export interface ChildProcessSupervisorOptions {
  /** Service name for the `[bridge]` log and hints, for example `playwright`. */
  name: string;
  settings: ServiceSettings;
  defaultVersion: string;
  prepare: Prepare;
  /** URL scheme clients use, for the `reachable at` log line (`ws` for the Playwright server). */
  scheme: 'http' | 'ws';
  /** Path clients use, appended to the URLs in that line, for example `/mcp`. Default none. */
  path?: string;
  /** `[bridge]` log: starts, crashes, restarts. */
  logger: Logger;
  /** Log for the service's own output, under its prefix. */
  output: Logger;
  policy?: RestartPolicy;
  /** Interval of the port check. Default 200 ms. */
  probeIntervalMs?: number;
}

/** How long the port may take to open after the start, before it counts as a crash. */
const READY_TIMEOUT_MS = 60_000;

const WILDCARD_PROBE: Record<string, string> = { '0.0.0.0': '127.0.0.1', '::': '::1' };

/** Whether something accepts connections on `host:port`. */
function portOpen(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: WILDCARD_PROBE[host] ?? host, port });
    const done = (open: boolean) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(1000, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs one child service (docs/operations.md#child-service-crashes): prepare, spawn, wait for
 * its port, restart after a crash with a growing delay, give up after too many crashes in a row,
 * and kill the whole process tree on stop.
 */
export class ChildProcessSupervisor implements ProcessSupervisor {
  private settings: ServiceSettings;
  /** Settings of the current run, until it is stopped. `status()` reports these. */
  private active: ResolvedSettings | null = null;
  private state: ServiceState = 'stopped';
  private restarts = 0;
  private exitCode: number | null = null;
  private crashesInRow = 0;
  private child: ChildProcess | null = null;
  private runningSince: number | null = null;
  private restartTimer: NodeJS.Timeout | undefined;
  private abort: AbortController | null = null;
  /** Bumped by every launch and stop, so callbacks of an older run do nothing. */
  private generation = 0;
  private waiters: (() => void)[] = [];

  constructor(private readonly options: ChildProcessSupervisorOptions) {
    this.settings = options.settings;
  }

  status(): ServiceStatus {
    const { version, port } = this.active ?? this.resolved();
    return {
      state: this.state,
      version,
      port,
      restarts: this.restarts,
      exitCode: this.exitCode,
    };
  }

  reconfigure(settings: ServiceSettings): void {
    this.settings = settings;
  }

  start(): Promise<void> {
    const settled = new Promise<void>((resolve) => this.waiters.push(resolve));
    if (this.state === 'stopped' || this.state === 'failed') {
      this.restarts = 0;
      this.crashesInRow = 0;
      this.exitCode = null;
      this.launch();
    }
    return settled;
  }

  async stop(): Promise<void> {
    this.generation++;
    clearTimeout(this.restartTimer);
    this.abort?.abort();
    this.abort = null;
    const child = this.child;
    this.child = null;
    this.runningSince = null;
    this.active = null;
    const wasStopped = this.state === 'stopped';
    this.setState('stopped');
    if (!wasStopped) this.options.logger.info(`${this.options.name} stopped`);
    if (child) await killTree(child);
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  private resolved(): ResolvedSettings {
    const { host, port, version } = this.settings;
    return { host, port, version: version ?? this.options.defaultVersion };
  }

  private setState(state: ServiceState): void {
    this.state = state;
    if (state === 'running' || state === 'failed' || state === 'stopped') {
      for (const resolve of this.waiters.splice(0)) resolve();
    }
  }

  private launch(): void {
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    const settings = this.resolved();
    this.active = settings;
    const abort = new AbortController();
    this.abort = abort;
    this.setState('starting');
    this.options.logger.info(
      `starting ${this.options.name} ${settings.version} on ${settings.host}:${settings.port}`,
    );

    this.options.prepare(settings, abort.signal).then(
      (command) => {
        if (current()) this.spawn(command, settings, generation);
      },
      (error: unknown) => {
        if (!current()) return;
        this.options.logger.error(
          `${this.options.name} could not be prepared: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.crashed(null, 'failed to start');
      },
    );
  }

  private spawn(command: Command, settings: ResolvedSettings, generation: number): void {
    const current = () => generation === this.generation;
    const child = spawn(command.command, [...command.args], {
      ...treeSpawnOptions,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.child = child;
    pipeLines(child, this.options.output);

    let exited = false;
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (exited) return;
      exited = true;
      if (!current()) return;
      this.child = null;
      // A child that dies leaves its own children behind: end them too.
      void killTree(child);
      const what =
        code !== null
          ? `exited with code ${code}`
          : signal !== null
            ? `was killed (${signal})`
            : 'failed to start';
      this.crashed(code, what);
    };
    child.once('exit', onExit);
    child.once('error', (error) => {
      this.options.logger.error(`${this.options.name} could not be started: ${error.message}`);
      if (child.pid === undefined) onExit(null, null);
    });

    void this.waitForPort(settings, generation, () => exited).then((open) => {
      if (!current() || exited) return;
      if (open) {
        this.runningSince = Date.now();
        this.setState('running');
        this.options.logger.info(`${this.options.name} running on ${this.where(settings)}`);
      } else {
        this.options.logger.error(
          `${this.options.name} did not open port ${settings.port} in time, killing it`,
        );
        void killTree(child);
      }
    });
  }

  /** Where clients reach it. On `0.0.0.0`, the machine's addresses (docs/operations.md#line-format). */
  private where({ host, port }: ResolvedSettings): string {
    const path = this.options.path ?? '';
    const urls = reachableUrls(this.options.scheme, host, port)
      .map((url) => `${url}${path}`)
      .join(', ');
    return isWildcard(host) ? `${hostPort(host, port)}, reachable at ${urls}` : urls;
  }

  private async waitForPort(
    settings: ResolvedSettings,
    generation: number,
    exited: () => boolean,
  ): Promise<boolean> {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    while (generation === this.generation && !exited() && Date.now() < deadline) {
      if (await portOpen(settings.host, settings.port)) return true;
      await delay(this.options.probeIntervalMs ?? 200);
    }
    return false;
  }

  private crashed(code: number | null, what: string): void {
    const { name, logger } = this.options;
    const ranForMs = this.runningSince === null ? 0 : Date.now() - this.runningSince;
    this.runningSince = null;
    this.exitCode = code;
    const decision = nextAfterCrash(this.crashesInRow, ranForMs, this.options.policy);
    this.crashesInRow = decision.crashesInRow;

    if (decision.action === 'fail') {
      logger.error(
        `${name} ${what}, ${decision.crashesInRow} crashes in a row: giving up. ` +
          'Restart the bridge to try again',
      );
      this.setState('failed');
      return;
    }
    logger.error(
      `${name} ${what}, restart ${this.restarts + 1} in ${formatDelay(decision.delayMs)}`,
    );
    this.setState('crashed');
    this.restartTimer = setTimeout(() => {
      this.restarts++;
      this.launch();
    }, decision.delayMs);
  }
}

function formatDelay(ms: number): string {
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
}
