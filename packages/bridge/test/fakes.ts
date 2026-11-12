import type { ConfigStore } from '../src/application/ports/out/config-store.js';
import type { Logger } from '../src/application/ports/out/logger.js';
import type { ConfigPatch } from '../src/domain/config.js';

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
