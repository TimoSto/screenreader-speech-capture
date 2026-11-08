import type { ConfigStore } from '../src/application/ports/out/config-store.js';
import type { Logger } from '../src/application/ports/out/logger.js';
import type {
  ProcessSupervisor,
  ServiceSettings,
} from '../src/application/ports/out/process-supervisor.js';
import type { ConfigPatch } from '../src/domain/config.js';
import type { ServiceState, ServiceStatus } from '../src/domain/service.js';

/** Logger that keeps its messages, as `"<level> <message>"`. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  error = (message: string) => void this.lines.push(`error ${message}`);
  warn = (message: string) => void this.lines.push(`warn ${message}`);
  info = (message: string) => void this.lines.push(`info ${message}`);
  debug = (message: string) => void this.lines.push(`debug ${message}`);
}

/** Config store in memory. `failSave` makes the next saves fail. */
export class MemoryConfigStore implements ConfigStore {
  readonly location = 'memory:config.json';
  saved: ConfigPatch | undefined;
  failSave = false;

  constructor(private readonly initial: unknown = undefined) {}

  load(): Promise<unknown> {
    return Promise.resolve(this.saved ?? this.initial);
  }

  save(file: ConfigPatch): Promise<void> {
    if (this.failSave) return Promise.reject(new Error('disk full'));
    this.saved = file;
    return Promise.resolve();
  }
}

/** Supervisor that records its calls and goes straight to `running` / `stopped`. */
export class FakeSupervisor implements ProcessSupervisor {
  readonly calls: string[] = [];
  settings: ServiceSettings = { host: '0.0.0.0', port: 3000, version: null };
  private state: ServiceState = 'stopped';

  start(): Promise<void> {
    this.calls.push('start');
    this.state = 'running';
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.calls.push('stop');
    this.state = 'stopped';
    return Promise.resolve();
  }

  restart(): Promise<void> {
    this.calls.push('restart');
    this.state = 'running';
    return Promise.resolve();
  }

  reconfigure(settings: ServiceSettings): void {
    this.calls.push('reconfigure');
    this.settings = settings;
  }

  status(): ServiceStatus {
    const { port, version } = this.settings;
    return { state: this.state, version: version ?? '1.0.0', port, restarts: 0, exitCode: null };
  }
}
