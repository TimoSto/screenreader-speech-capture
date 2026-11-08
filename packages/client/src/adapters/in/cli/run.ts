import { parseArgs } from 'node:util';
import type { ManageClientConfig } from '../../../application/ports/in/manage-client-config.js';
import { ClientConfigError, URL_ENV, type ValueSource } from '../../../domain/bridge-url.js';

/** Exit codes (docs/client.md#cli-for-agents). */
export const EXIT = { ok: 0, timeout: 1, bridge: 2, usage: 3 } as const;

export interface CliIo {
  /** The per-user settings behind `config` and the bridge URL. */
  config: ManageClientConfig;
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
  const { config } = io;
  const file = config.location;
  const explicit = { url: globals.url };
  const out = (json: unknown, text: string) =>
    io.stdout(globals.json ? `${JSON.stringify(json)}\n` : `${text}\n`);

  const [action, ...rest] = args;
  switch (action) {
    case 'set': {
      const [key, value] = expectArgs(rest, 2, 'config set <key> <value>');
      const result = await config.set(key, value);
      out({ ...result, file }, `Saved ${result.key} = ${result.value} to ${file}`);
      if (result.shadowedBy === 'env') {
        io.stderr(`Note: ${URL_ENV} is set and takes precedence over the config file.\n`);
      }
      return EXIT.ok;
    }
    case 'get': {
      const [key] = expectArgs(rest, 1, 'config get <key>');
      const result = await config.get(key, explicit);
      out(result, `${result.value} (${SOURCE_LABEL[result.source]})`);
      return EXIT.ok;
    }
    case 'unset': {
      const [key] = expectArgs(rest, 1, 'config unset <key>');
      const result = await config.unset(key);
      out({ ...result, file }, `Removed ${result.key} from ${file}`);
      return EXIT.ok;
    }
    case 'list': {
      expectArgs(rest, 0, 'config list');
      const entries = await config.list(explicit);
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
