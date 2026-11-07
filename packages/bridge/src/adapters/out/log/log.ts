import type { Logger } from '../../../application/ports/out/logger.js';
import type { LogLevel } from '../../../domain/config.js';

/** Parts of the bridge that write to the log (docs/operations.md#line-format). */
export type LogPrefix =
  | 'bridge'
  | 'config'
  | 'speech-capture'
  | 'http-api'
  | 'native-input'
  | 'playwright-server'
  | 'playwright-mcp';

const ESC = '\u001b[';
const RESET = `${ESC}0m`;

const PREFIX_COLOURS: Record<LogPrefix, string> = {
  bridge: `${ESC}1;37m`, // bold white
  config: `${ESC}90m`, // grey
  'speech-capture': `${ESC}32m`, // green
  'http-api': `${ESC}34m`, // blue
  'native-input': `${ESC}35m`, // magenta
  'playwright-server': `${ESC}36m`, // cyan
  'playwright-mcp': `${ESC}94m`, // bright blue
};

const LEVEL_COLOURS: Record<LogLevel, string | null> = {
  error: `${ESC}31m`, // red
  warn: `${ESC}33m`, // yellow
  info: null, // default
  debug: `${ESC}90m`, // grey
};

const LEVEL_RANK: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

/** Longest prefix (`[playwright-server]`, 19 characters) plus one space. Fixed, so lines align. */
export const PREFIX_WIDTH = Math.max(...Object.keys(PREFIX_COLOURS).map((p) => p.length + 2)) + 1;

function paint(text: string, colour: string | null, enabled: boolean): string {
  return enabled && colour !== null ? `${colour}${text}${RESET}` : text;
}

/**
 * Formats one message as one or more log lines (without line breaks). Every line of a
 * multi-line message gets the full prefix, timestamp and level. Padding is counted without
 * colour codes.
 */
export function formatLogLines(
  prefix: LogPrefix,
  level: LogLevel,
  time: Date,
  message: string,
  colour: boolean,
): string[] {
  const tag = `[${prefix}]`;
  const head =
    paint(tag, PREFIX_COLOURS[prefix], colour) +
    ' '.repeat(PREFIX_WIDTH - tag.length) +
    `${time.toISOString()} ` +
    paint(level.toUpperCase(), LEVEL_COLOURS[level], colour) +
    ' '.repeat(6 - level.length);
  return message.split(/\r?\n/).map((line) => head + line);
}

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
 * bridge would log it again, in an endless loop (docs/operations.md#logging).
 */
export type LogChannel = 'log' | 'speech';

/**
 * Decides whether a console stream gets colours: `NO_COLOR` turns them off, `FORCE_COLOR`
 * turns them on, otherwise only on a terminal.
 */
export function wantsColour(isTTY: boolean | undefined, env: NodeJS.ProcessEnv): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '' && env.FORCE_COLOR !== '0') {
    return true;
  }
  return isTTY === true;
}

export interface ConsoleSinkOptions {
  /** Also write the speech channel to the console. Off by default (feedback loop). */
  speech?: boolean;
  stream?: NodeJS.WriteStream;
  env?: NodeJS.ProcessEnv;
}

/** Console sink on stdout. */
export function consoleSink(options: ConsoleSinkOptions = {}): LogSink {
  const { speech = false, stream = process.stdout, env = process.env } = options;
  return {
    colour: wantsColour(stream.isTTY, env),
    speech,
    write: (line) => void stream.write(`${line}\n`),
  };
}

/** The bridge log: one level, several sinks, one `Logger` per prefix. */
export class BridgeLog {
  private readonly sinks: LogSink[];

  constructor(
    private level: LogLevel,
    sinks: LogSink[],
    private readonly now: () => Date = () => new Date(),
  ) {
    this.sinks = [...sinks];
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  addSink(sink: LogSink): void {
    this.sinks.push(sink);
  }

  removeSink(sink: LogSink): void {
    const index = this.sinks.indexOf(sink);
    if (index !== -1) this.sinks.splice(index, 1);
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
