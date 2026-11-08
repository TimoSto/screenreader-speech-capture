import { parseArgs } from 'node:util';
import {
  ClientConfigError,
  normalizeBridgeUrl,
  resolveBridgeUrl,
  URL_ENV,
  type ClientConfigStore,
  type Resolved,
  type ValueSource,
} from '../../../index.js';

/** Exit codes (docs/client.md#cli-for-agents). */
export const EXIT = { ok: 0, timeout: 1, bridge: 2, usage: 3 } as const;

export interface CliIo {
  env: NodeJS.ProcessEnv;
  /** Where `config` reads and writes the per-user settings. */
  store: ClientConfigStore;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  version: string;
}

class UsageError extends Error {}

const NAME = 'screenreader-speech-capture-client';

const SOURCE_LABEL: Record<ValueSource, string> = {
  explicit: '--url',
  env: URL_ENV,
  config: 'config file',
  default: 'default',
};

/** Keys `config` can set. Each one is checked and normalised before it is written. */
const KEYS = { url: (value: string) => normalizeBridgeUrl(value) } as const;
type Key = keyof typeof KEYS;

export function helpText(): string {
  return `Usage: ${NAME} <command> [options]

Commands:
  config set url <url>   Store the bridge URL for this user
  config get url         Show the bridge URL in use and where it comes from
  config unset url       Remove the stored bridge URL
  config list            Show all settings and where they come from
  config path            Show the path of the config file

Options:
  --url <url>   Bridge URL (env ${URL_ENV}, then the config file, default http://localhost:5151)
  --json        Machine-readable output
  -h, --help    Show this help
  -v, --version Show the version

Exit codes: 0 success, 1 timeout / no match, 2 bridge not reachable, 3 invalid usage or config.
`;
}

/** Runs one CLI invocation and returns its exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.stderr(`${NAME}: ${error.message}\nRun with --help to see the commands.\n`);
      return EXIT.usage;
    }
    if (error instanceof ClientConfigError) {
      io.stderr(`${NAME}: ${error.message}\n`);
      return EXIT.usage;
    }
    throw error;
  }
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        url: { type: 'string' },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
        version: { type: 'boolean', short: 'v', default: false },
      },
    });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    io.stdout(helpText());
    return EXIT.ok;
  }
  if (values.version) {
    io.stdout(`${io.version}\n`);
    return EXIT.ok;
  }

  const [command, ...rest] = positionals;
  switch (command) {
    case 'config':
      return config(rest, { url: values.url, json: values.json }, io);
    case undefined:
      throw new UsageError('Missing command.');
    default:
      throw new UsageError(`Unknown command "${command}".`);
  }
}

interface Globals {
  url: string | undefined;
  json: boolean;
}

async function config(args: string[], globals: Globals, io: CliIo): Promise<number> {
  const { store } = io;
  const file = store.location;
  const out = (json: unknown, text: string) =>
    io.stdout(globals.json ? `${JSON.stringify(json)}\n` : `${text}\n`);
  const resolveKey = (_key: Key): Promise<Resolved> =>
    resolveBridgeUrl({ explicit: globals.url, env: io.env, store });

  const [action, ...rest] = args;
  switch (action) {
    case 'set': {
      const [key, value] = expectArgs(rest, 2, 'config set <key> <value>');
      const k = expectKey(key);
      const normalized = KEYS[k](value);
      await store.save({ [k]: normalized });
      out({ key: k, value: normalized, file }, `Saved ${k} = ${normalized} to ${file}`);
      const env = io.env[URL_ENV];
      if (k === 'url' && env !== undefined && env !== '') {
        io.stderr(`Note: ${URL_ENV}=${env} is set and takes precedence over the config file.\n`);
      }
      return EXIT.ok;
    }
    case 'get': {
      const [key] = expectArgs(rest, 1, 'config get <key>');
      const k = expectKey(key);
      const { value, source } = await resolveKey(k);
      out({ key: k, value, source }, `${value} (${SOURCE_LABEL[source]})`);
      return EXIT.ok;
    }
    case 'unset': {
      const [key] = expectArgs(rest, 1, 'config unset <key>');
      const k = expectKey(key);
      await store.save({ [k]: undefined });
      out({ key: k, file }, `Removed ${k} from ${file}`);
      return EXIT.ok;
    }
    case 'list': {
      expectArgs(rest, 0, 'config list');
      const entries = await Promise.all(
        (Object.keys(KEYS) as Key[]).map(async (k) => ({ key: k, ...(await resolveKey(k)) })),
      );
      out(
        { file, settings: entries },
        [
          `# ${file}`,
          ...entries.map((e) => `${e.key} = ${e.value} (${SOURCE_LABEL[e.source]})`),
        ].join('\n'),
      );
      return EXIT.ok;
    }
    case 'path':
      expectArgs(rest, 0, 'config path');
      out({ file }, file);
      return EXIT.ok;
    case undefined:
      throw new UsageError('Missing config action: set, get, unset, list or path.');
    default:
      throw new UsageError(`Unknown config action "${action}": use set, get, unset, list or path.`);
  }
}

type Args<N extends number, T extends string[] = []> = T['length'] extends N
  ? T
  : Args<N, [...T, string]>;

function expectArgs<N extends 0 | 1 | 2>(args: string[], count: N, usage: string): Args<N> {
  if (args.length !== count) throw new UsageError(`Usage: ${NAME} ${usage}`);
  return args as Args<N>;
}

function expectKey(key: string): Key {
  if (Object.hasOwn(KEYS, key)) return key as Key;
  throw new UsageError(`Unknown config key "${key}". Known keys: ${Object.keys(KEYS).join(', ')}.`);
}
