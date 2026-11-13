import type { LogLevel } from '../../../domain/config/index.js';

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
