import type { Logger } from '../../../application/ports/out/logger.js';
import type { LogLevel } from '../../../domain/config/index.js';
import { formatLogLines, type LogPrefix } from './format.js';

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/**
 * Where formatted lines go. `colour`: the sink wants ANSI colours. `speech`: the sink accepts
 * the `speech` channel (the text the screen reader said).
 */
export interface LogSink {
  readonly colour: boolean;
  readonly speech: boolean;
  write(line: string): void;
}

/**
 * `log`: what the bridge does. `speech`: the text the screen reader said. Speech is kept off the
 * console by default, because a screen reader reading the console would speak it again and the
 * bridge would log it again, in an endless loop (docs/usage/operations.md#logging).
 */
export type LogChannel = 'log' | 'speech';

/** The bridge log: one level, several sinks, one `Logger` per prefix. */
export class BridgeLog {
  constructor(
    private level: LogLevel,
    private readonly sinks: readonly LogSink[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  for(prefix: LogPrefix, options: { channel?: LogChannel } = {}): Logger {
    const channel = options.channel ?? 'log';
    const log = (level: LogLevel) => (message: string) =>
      this.write(prefix, level, message, channel);
    return { error: log('error'), warn: log('warn'), info: log('info'), debug: log('debug') };
  }

  /** Writes an INFO line whatever the level is (for the startup line). */
  always(prefix: LogPrefix, message: string): void {
    this.emit(prefix, 'info', message, 'log');
  }

  private write(prefix: LogPrefix, level: LogLevel, message: string, channel: LogChannel): void {
    if (LEVEL_RANK[level] > LEVEL_RANK[this.level]) return;
    this.emit(prefix, level, message, channel);
  }

  private emit(prefix: LogPrefix, level: LogLevel, message: string, channel: LogChannel): void {
    const time = this.now();
    for (const sink of this.sinks) {
      if (channel === 'speech' && !sink.speech) continue;
      for (const line of formatLogLines(prefix, level, time, message, sink.colour)) {
        sink.write(line);
      }
    }
  }
}
