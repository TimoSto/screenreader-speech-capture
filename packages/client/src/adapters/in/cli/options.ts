import type { parseArgs } from 'node:util';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import { URL_ENV } from '../../../domain/bridge-url.js';
import type { SessionRef } from '../../../domain/speech-entry.js';

export const NAME = 'screenreader-speech-capture-client';

/** Invalid usage: printed with a hint to `--help`, exit code 3. */
export class UsageError extends Error {}

/** Every option; each command lists the ones it takes (`commands/`). */
export const OPTIONS = {
  url: { type: 'string' },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false },
  since: { type: 'string' },
  limit: { type: 'string' },
  timeout: { type: 'string' },
  'quiet-for': { type: 'string' },
  'include-markers': { type: 'boolean' },
  separator: { type: 'string' },
  regex: { type: 'boolean' },
  normalize: { type: 'boolean' },
  'wait-ready': { type: 'boolean' },
  run: { type: 'string' },
  session: { type: 'string' },
  all: { type: 'boolean' },
} as const;

export type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];
export type Option = keyof typeof OPTIONS;

/** Options every command takes, with their help rows. */
export const GLOBAL_OPTIONS: readonly { option: Option; flag: string; description: string }[] = [
  {
    option: 'url',
    flag: '--url <url>',
    description: `Bridge URL (env ${URL_ENV}, then the config file, default http://localhost:5151)`,
  },
  { option: 'json', flag: '--json', description: 'Machine-readable output' },
  { option: 'help', flag: '-h, --help', description: 'Show this help' },
  { option: 'version', flag: '-v, --version', description: 'Show the version' },
];

/** Throws unless every given option is global or in `allowed`. */
export function checkOptions(command: string, allowed: readonly Option[], values: Values): void {
  const all = new Set<string>([...GLOBAL_OPTIONS.map((g) => g.option), ...allowed]);
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && !all.has(name)) {
      throw new UsageError(`"${command}" does not take --${name}.`);
    }
  }
}

/** An integer option >= `min`, `undefined` if not given. */
export function optionalInt(values: Values, name: Option, min: number): number | undefined {
  const raw = values[name];
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (
    typeof raw !== 'string' ||
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(value) ||
    value < min
  ) {
    throw new UsageError(`--${name} must be an integer >= ${min}, got "${String(raw)}".`);
  }
  return value;
}

type Args<N extends number, T extends string[] = []> = T['length'] extends N
  ? T
  : Args<N, [...T, string]>;

/** The positional arguments, if there are exactly `count`; otherwise a usage error. */
export function expectArgs<N extends 0 | 1 | 2>(args: string[], count: N, usage: string): Args<N> {
  if (args.length !== count) throw new UsageError(`Usage: ${NAME} ${usage}`);
  return args as Args<N>;
}

/**
 * The session `speech`, `text` and `wait` read: `--session <id>`, nothing with `--all`, otherwise
 * the current session. Its id, not `'current'`, so a bridge without a current session (or older
 * than API 1.3) reads the whole buffer instead of answering 404.
 */
export async function scope(
  values: Values,
  speech: SpeechCapture,
): Promise<SessionRef | undefined> {
  const id = optionalInt(values, 'session', 1);
  if (values.all && id !== undefined) throw new UsageError('Use either --session or --all.');
  if (id !== undefined) return id;
  if (values.all) return undefined;
  return (await speech.status()).session?.current?.id;
}
