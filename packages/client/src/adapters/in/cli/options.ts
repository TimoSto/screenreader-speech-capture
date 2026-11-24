import type { parseArgs } from 'node:util';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import { URL_ENV } from '../../../domain/bridge-url.js';
import type { SessionRef } from '../../../domain/session.js';

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
  'first-within': { type: 'string' },
  settle: { type: 'string' },
  'include-markers': { type: 'boolean' },
  separator: { type: 'string' },
  regex: { type: 'boolean' },
  normalize: { type: 'boolean' },
  'wait-ready': { type: 'boolean' },
  run: { type: 'string' },
  session: { type: 'string' },
  all: { type: 'boolean' },
  outside: { type: 'boolean' },
  x: { type: 'string' },
  y: { type: 'string' },
  button: { type: 'string' },
  delay: { type: 'string' },
  capture: { type: 'boolean' },
  script: { type: 'boolean' },
  geometry: { type: 'string' },
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

/** `raw` as an integer >= `min` (digits only), or a usage error with `message`. */
export function intArg(raw: string, min: number, message: string): number {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min) {
    throw new UsageError(message);
  }
  return value;
}

/** An integer option >= `min`, `undefined` if not given. */
export function optionalInt(values: Values, name: Option, min: number): number | undefined {
  const raw = values[name];
  if (raw === undefined) return undefined;
  const message = `--${name} must be an integer >= ${min}, got "${String(raw)}".`;
  if (typeof raw !== 'string') throw new UsageError(message);
  return intArg(raw, min, message);
}

type Args<N extends number, T extends string[] = []> = T['length'] extends N
  ? T
  : Args<N, [...T, string]>;

/** The positional arguments, if there are exactly `count`; otherwise a usage error. */
export function expectArgs<N extends 0 | 1 | 2>(args: string[], count: N, usage: string): Args<N> {
  if (args.length !== count) throw new UsageError(`Usage: ${NAME} ${usage}`);
  return args as Args<N>;
}

/** `--session <id|current>`, the same for the reads and `clear`. */
export function sessionOption(values: Values): SessionRef | undefined {
  const raw = values.session;
  if (raw === undefined || raw === 'current') return raw;
  return intArg(raw, 1, `--session must be a session id (>= 1) or current, got "${raw}".`);
}

/**
 * The session `speech`, `text` and `wait` read: `--session <id|current>`, nothing with `--all`,
 * otherwise the current session. Without an option it is the current session's id, not
 * `'current'`, so with none current it reads the whole buffer instead of answering 404. An explicit
 * `--session current` stays `'current'`: with none current that is the bridge's `NOT_FOUND`.
 */
export async function scope(
  values: Values,
  speech: SpeechCapture,
): Promise<SessionRef | undefined> {
  const session = sessionOption(values);
  if (values.all && session !== undefined) throw new UsageError('Use either --session or --all.');
  if (session !== undefined) return session;
  if (values.all) return undefined;
  return (await speech.status()).session.current?.id;
}

/** A required integer option, may be negative (a screen left of the primary one): `--x=-5`. */
export function requiredSignedInt(values: Values, name: Option, usage: string): number {
  const raw = values[name];
  if (typeof raw !== 'string') throw new UsageError(`Usage: ${NAME} ${usage}`);
  if (!/^-?\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new UsageError(`--${name} must be an integer, got "${raw}".`);
  }
  return Number(raw);
}
