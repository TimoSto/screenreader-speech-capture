import { parseArgs } from 'node:util';
import type { ManageClientConfig } from '../../../application/ports/in/manage-client-config.js';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import { ClientConfigError, URL_ENV, type ValueSource } from '../../../domain/bridge-url.js';
import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from '../../../domain/errors.js';
import type { BridgeStatus, SpeechEntry } from '../../../domain/speech-entry.js';

/** Exit codes (docs/client.md#cli-for-agents). */
export const EXIT = { ok: 0, timeout: 1, bridge: 2, usage: 3 } as const;

export interface CliIo {
  /** The per-user settings behind `config` and the bridge URL. */
  config: ManageClientConfig;
  /** A client for the bridge at `url` (`--url`), or at the configured URL if `undefined`. */
  speech: (url: string | undefined) => SpeechCapture;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  version: string;
  /**
   * Takes over Ctrl+C for a command that runs until interrupted (`tail`): the returned signal
   * aborts on SIGINT / SIGTERM (and when stdout is closed) instead of the process exiting.
   */
  interrupt: () => AbortSignal;
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
  status [--wait-ready] [--timeout <ms>]
                         Bridge health and versions; --wait-ready waits until it is ready
                         (default timeout 120000)
  clear                  Clear the speech buffer
  speech [--since <seq>] [--limit <n>] [--include-markers]
                         Recorded speech entries, oldest first
  text [--since <seq>] [--separator <s>]
                         All speech joined into one text (one line per entry)
  wait <text> [--regex] [--normalize] [--since <seq>] [--timeout <ms>]
                         Wait until speech contains <text> (or matches the regex);
                         also finds speech that arrived before the call (default timeout 5000)
  wait-silence [--quiet-for <ms>] [--timeout <ms>]
                         Wait until nothing was spoken for --quiet-for ms (default 500, 10000)
  mark <label>           Insert a marker and print its seq, for --since
  tail [--since <seq>]   Print speech live as it arrives, until Ctrl+C (one JSON event per
                         line with --json); --since first prints the buffered entries after <seq>

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

--since <seq> takes a seq printed by mark (default 0: everything since the last clear; for
tail, default: only new speech).

Exit codes: 0 success, 1 timeout / no match, 2 bridge not reachable, HTTP error or
incompatible bridge, 3 invalid usage or config.
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
    if (error instanceof BridgeNotReadyError) {
      io.stderr(`${NAME}: ${error.message}\n`);
      return EXIT.timeout;
    }
    if (
      error instanceof BridgeUnreachableError ||
      error instanceof BridgeHttpError ||
      error instanceof IncompatibleBridgeError
    ) {
      io.stderr(`${NAME}: ${error.message}\n`);
      return EXIT.bridge;
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
      options: OPTIONS,
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
  if (command === undefined) throw new UsageError('Missing command.');
  if (!isCommand(command)) throw new UsageError(`Unknown command "${command}".`);
  checkOptions(command, values);
  const globals = { url: values.url, json: values.json };
  if (command === 'config') return config(rest, globals, io);
  const ctx: Context = {
    ...globals,
    values,
    speech: io.speech(values.url),
    out: (json, text) => io.stdout(values.json ? `${JSON.stringify(json)}\n` : `${text}\n`),
    io,
  };
  return SPEECH_COMMANDS[command](rest, ctx);
}

/** Every option; {@link COMMAND_OPTIONS} says which command takes which. */
const OPTIONS = {
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
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'];
type Option = keyof typeof OPTIONS;

/** Options every command takes. */
const GLOBAL_OPTIONS: readonly Option[] = ['url', 'json', 'help', 'version'];

const COMMAND_OPTIONS = {
  config: [],
  status: ['wait-ready', 'timeout'],
  clear: [],
  speech: ['since', 'limit', 'include-markers'],
  text: ['since', 'separator'],
  wait: ['regex', 'normalize', 'since', 'timeout'],
  'wait-silence': ['quiet-for', 'timeout'],
  mark: [],
  tail: ['since'],
} as const satisfies Record<string, readonly Option[]>;

type Command = keyof typeof COMMAND_OPTIONS;

const isCommand = (name: string): name is Command => Object.hasOwn(COMMAND_OPTIONS, name);

function checkOptions(command: Command, values: Values): void {
  const allowed: readonly Option[] = [...GLOBAL_OPTIONS, ...COMMAND_OPTIONS[command]];
  for (const [name, value] of Object.entries(values)) {
    if (value !== undefined && !allowed.includes(name as Option)) {
      throw new UsageError(`"${command}" does not take --${name}.`);
    }
  }
}

interface Globals {
  url: string | undefined;
  json: boolean;
}

interface Context extends Globals {
  values: Values;
  speech: SpeechCapture;
  /** Prints `json` with --json, `text` otherwise. */
  out: (json: unknown, text: string) => void;
  io: CliIo;
}

const SPEECH_COMMANDS: Record<
  Exclude<Command, 'config'>,
  (args: string[], ctx: Context) => Promise<number>
> = {
  async status(args, { values, speech, out }) {
    expectArgs(args, 0, 'status [--wait-ready] [--timeout <ms>]');
    const timeout = optionalInt(values, 'timeout', 0);
    if (!values['wait-ready'] && timeout !== undefined) {
      throw new UsageError('--timeout needs --wait-ready.');
    }
    const status = values['wait-ready']
      ? await speech.waitForReady({ timeout })
      : await speech.status();
    out(status, formatStatus(status));
    return EXIT.ok;
  },

  async clear(args, { speech, out }) {
    expectArgs(args, 0, 'clear');
    await speech.clear();
    out({ cleared: true }, 'Speech buffer cleared.');
    return EXIT.ok;
  },

  async speech(args, { values, speech, out }) {
    expectArgs(args, 0, 'speech [--since <seq>] [--limit <n>] [--include-markers]');
    const entries = await speech.getSpeech({
      since: optionalInt(values, 'since', 0) ?? 0,
      limit: optionalInt(values, 'limit', 1),
      includeMarkers: values['include-markers'] ?? false,
    });
    out({ entries }, entries.map(formatEntry).join('\n'));
    return EXIT.ok;
  },

  async text(args, { values, speech, out }) {
    expectArgs(args, 0, 'text [--since <seq>] [--separator <s>]');
    const text = await speech.getText({
      since: optionalInt(values, 'since', 0) ?? 0,
      separator: values.separator,
    });
    out({ text }, text);
    return EXIT.ok;
  },

  async wait(args, { values, speech, out, io, json }) {
    const [text] = expectArgs(args, 1, 'wait <text> [--regex] [--normalize] [--timeout <ms>]');
    if (text.trim() === '') throw new UsageError('The text to wait for must not be empty.');
    let match: string | RegExp = text;
    if (values.regex) {
      try {
        match = new RegExp(text, 'u');
      } catch (error) {
        throw new UsageError(`Invalid --regex: ${(error as Error).message}`);
      }
    }
    try {
      const entry = await speech.waitForOutput(match, {
        since: optionalInt(values, 'since', 0) ?? 0,
        timeout: optionalInt(values, 'timeout', 0),
        normalize: values.normalize ?? false,
      });
      out({ matched: true, entry }, formatEntry(entry));
      return EXIT.ok;
    } catch (error) {
      if (!(error instanceof SpeechTimeoutError)) throw error;
      if (json) io.stdout(`${JSON.stringify({ matched: false, entries: error.entries })}\n`);
      io.stderr(`${NAME}: ${error.message}.${seenText(error.entries)}\n`);
      return EXIT.timeout;
    }
  },

  async 'wait-silence'(args, { values, speech, out, io }) {
    expectArgs(args, 0, 'wait-silence [--quiet-for <ms>] [--timeout <ms>]');
    const quietFor = optionalInt(values, 'quiet-for', 1);
    try {
      await speech.waitForSilence({ quietFor, timeout: optionalInt(values, 'timeout', 0) });
      out({ silent: true }, 'Silent.');
      return EXIT.ok;
    } catch (error) {
      if (!(error instanceof SpeechTimeoutError)) throw error;
      io.stderr(`${NAME}: ${error.message}.\n`);
      return EXIT.timeout;
    }
  },

  async mark(args, { speech, out }) {
    const [label] = expectArgs(args, 1, 'mark <label>');
    const entry = await speech.mark(label);
    out(entry, String(entry.seq));
    return EXIT.ok;
  },

  async tail(args, { values, speech, io, json }) {
    expectArgs(args, 0, 'tail [--since <seq>]');
    const since = optionalInt(values, 'since', 0);
    // Unreachable or incompatible: exit 2 at once, like every other command. Later connection
    // problems are retried.
    await speech.status();
    const signal = io.interrupt();
    const print = (event: unknown, text: string) =>
      io.stdout(json ? `${JSON.stringify(event)}\n` : `${text}\n`);
    return new Promise<number>((resolve) => {
      const finish = (code: number) => {
        signal.removeEventListener('abort', interrupted);
        stop();
        resolve(code);
      };
      const interrupted = () => finish(EXIT.ok);
      const stop = speech.onSpeech((entry) => print({ type: 'entry', entry }, formatEntry(entry)), {
        since,
        includeMarkers: true,
        onClear: () => print({ type: 'clear' }, '--- buffer cleared ---'),
        onTruncated: () => {
          if (json) print({ type: 'truncated' }, '');
          io.stderr(
            `${NAME}: some entries were dropped from the bridge's buffer before they could be shown.\n`,
          );
        },
        onError: (error, { retrying }) => {
          io.stderr(`${NAME}: ${error.message}${retrying ? ', reconnecting' : ''}\n`);
          if (!retrying) finish(EXIT.bridge);
        },
      });
      if (signal.aborted) finish(EXIT.ok);
      else signal.addEventListener('abort', interrupted, { once: true });
    });
  },
};

/** An integer option >= `min`, `undefined` if not given. */
function optionalInt(values: Values, name: Option, min: number): number | undefined {
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

function formatEntry(entry: SpeechEntry): string {
  return entry.kind === 'marker'
    ? `#${entry.seq} [marker] ${entry.text}`
    : `#${entry.seq} ${entry.text}`;
}

function seenText(entries: SpeechEntry[]): string {
  if (entries.length === 0) return ' No speech arrived.';
  return ` Speech seen:\n${entries.map((e) => `  ${formatEntry(e)}`).join('\n')}`;
}

function formatStatus(status: BridgeStatus): string {
  const { bridge, tcp, buffer, input } = status;
  const connections = tcp.connections.length;
  const range =
    buffer.firstSeq === null
      ? 'empty'
      : `seq ${buffer.firstSeq}-${buffer.lastSeq ?? buffer.firstSeq}`;
  return [
    `bridge  ${bridge.version} (API ${bridge.apiVersion}), ${bridge.state}`,
    `tcp     ${tcp.host}:${tcp.port} ${tcp.listening ? 'listening' : 'not listening'}, ` +
      `${connections} voice connection${connections === 1 ? '' : 's'}, ${tcp.encoding}`,
    `buffer  ${buffer.size} of ${buffer.maxEntries} entries (${range})`,
    `input   ${input.enabled ? 'enabled' : 'disabled'}`,
  ].join('\n');
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
