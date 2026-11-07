import { parseArgs } from 'node:util';
import type { ConfigField } from '../../../domain/config.js';

// Flags and environment variables (docs/configuration.md#cli-flags). Values are only parsed
// here; the configuration checks their ranges and names the flag in its error.

interface Setting {
  /** Flag name without `--`. The environment variable is `SR_SPEECH_` + it in upper snake case. */
  flag: string;
  /** The setting it changes. `undefined` for `--config`, which only selects the file. */
  field?: ConfigField;
  /** `on` / `off`: a switch that sets the setting to `true` / `false`. */
  kind: 'string' | 'integer' | 'on' | 'off';
  arg?: string;
  description: string;
}

const SETTINGS: readonly Setting[] = [
  {
    flag: 'tcp-host',
    field: 'tcp.host',
    kind: 'string',
    arg: '<addr>',
    description: 'Interface for the speech TCP listener (default 127.0.0.1)',
  },
  {
    flag: 'tcp-port',
    field: 'tcp.port',
    kind: 'integer',
    arg: '<n>',
    description: 'Port the socket voice connects to (default 4449)',
  },
  {
    flag: 'tcp-encoding',
    field: 'tcp.encoding',
    kind: 'string',
    arg: '<enc>',
    description: 'Code page of the incoming text (default windows-1252)',
  },
  {
    flag: 'host',
    field: 'http.host',
    kind: 'string',
    arg: '<addr>',
    description: 'Interface for HTTP, Playwright server and MCP (default 0.0.0.0)',
  },
  {
    flag: 'http-port',
    field: 'http.port',
    kind: 'integer',
    arg: '<n>',
    description: 'HTTP API and web UI (default 5151)',
  },
  {
    flag: 'playwright-port',
    field: 'playwright.port',
    kind: 'integer',
    arg: '<n>',
    description: 'Playwright server (default 3000)',
  },
  {
    flag: 'playwright-version',
    field: 'playwright.version',
    kind: 'string',
    arg: '<v>',
    description: 'Playwright version of the server (default: bundled)',
  },
  {
    flag: 'mcp-port',
    field: 'mcp.port',
    kind: 'integer',
    arg: '<n>',
    description: 'Playwright MCP (default 8931)',
  },
  {
    flag: 'no-playwright',
    field: 'playwright.enabled',
    kind: 'off',
    description: "Don't start the Playwright server",
  },
  { flag: 'no-mcp', field: 'mcp.enabled', kind: 'off', description: "Don't start Playwright MCP" },
  {
    flag: 'no-input',
    field: 'input.enabled',
    kind: 'off',
    description: 'Disable the native input endpoints',
  },
  {
    flag: 'log-level',
    field: 'log.level',
    kind: 'string',
    arg: '<level>',
    description: 'error, warn, info (default) or debug',
  },
  {
    flag: 'bridge-log',
    field: 'log.file',
    kind: 'string',
    arg: '<path>',
    description: 'File for the bridge log',
  },
  {
    flag: 'console-speech',
    field: 'log.consoleSpeech',
    kind: 'on',
    description: 'Also write the speech to the console (feedback loop on the VM!)',
  },
  { flag: 'config', kind: 'string', arg: '<path>', description: 'Use a different config file' },
];

const envName = (flag: string) => `SR_SPEECH_${flag.toUpperCase().replaceAll('-', '_')}`;

/** A flag or environment variable that can't be read. The message names it. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

export interface CliOptions {
  /** Settings from flags and environment variables, flags winning. Not validated yet. */
  overrides: Record<string, Record<string, unknown>>;
  /** What set each setting in `overrides`, for example `--tcp-port` or `SR_SPEECH_TCP_PORT`. */
  sources: Map<ConfigField, string>;
  /** `--config` / `SR_SPEECH_CONFIG`. */
  configFile: string | undefined;
  help: boolean;
  version: boolean;
}

const ON = ['1', 'true', 'yes', 'on'];
const OFF = ['', '0', 'false', 'no', 'off'];

/** The value of one setting, `undefined` when it isn't set. */
function read(setting: Setting, raw: string | boolean, source: string): unknown {
  if (typeof raw === 'boolean') return setting.kind === 'off' ? !raw : raw;
  switch (setting.kind) {
    case 'string':
      return raw;
    case 'integer':
      if (!/^\d+$/.test(raw)) throw new UsageError(`${source}: must be a whole number`);
      return Number(raw);
    case 'on':
    case 'off': {
      // Environment variables of switches: on turns the switch on, off counts as not set.
      const value = raw.toLowerCase();
      if (OFF.includes(value)) return undefined;
      if (!ON.includes(value)) throw new UsageError(`${source}: must be 1 or 0`);
      return setting.kind === 'on';
    }
  }
}

/** Reads the flags in `argv` and the `SR_SPEECH_*` variables in `env`. Flags win. */
export function parseCli(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions {
  let values: Record<string, string | boolean | undefined>;
  try {
    ({ values } = parseArgs({
      args: [...argv],
      strict: true,
      allowPositionals: false,
      options: {
        ...Object.fromEntries(
          SETTINGS.map((s) => [
            s.flag,
            { type: s.kind === 'on' || s.kind === 'off' ? 'boolean' : 'string' } as const,
          ]),
        ),
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (error) {
    throw new UsageError((error as Error).message, { cause: error });
  }

  const result: CliOptions = {
    overrides: {},
    sources: new Map(),
    configFile: undefined,
    help: values.help === true,
    version: values.version === true,
  };
  for (const setting of SETTINGS) {
    const flag = values[setting.flag];
    const name = envName(setting.flag);
    const fromEnv = env[name];
    const [raw, source] = flag !== undefined ? [flag, `--${setting.flag}`] : [fromEnv, name];
    if (raw === undefined) continue;
    const value = read(setting, raw, source);
    if (value === undefined) continue;
    if (setting.field === undefined) {
      result.configFile = value as string;
      continue;
    }
    const [section, key] = setting.field.split('.') as [string, string];
    (result.overrides[section] ??= {})[key] = value;
    result.sources.set(setting.field, source);
  }
  return result;
}

/** `--help`. */
export function helpText(): string {
  const rows = SETTINGS.map((s) => [`--${s.flag}${s.arg ? ` ${s.arg}` : ''}`, s.description]);
  rows.push(['-h, --help', 'Show this help'], ['-v, --version', 'Show the version']);
  const width = Math.max(...rows.map(([left]) => left!.length)) + 2;
  return [
    'Usage: screenreader-speech-capture [options]',
    '',
    'Captures what a screen reader says and serves it over HTTP.',
    '',
    'Options:',
    ...rows.map(([left, right]) => `  ${left!.padEnd(width)}${right}`),
    '',
    'Each option can also be set as an environment variable: SR_SPEECH_ plus the name in upper',
    'snake case, for example SR_SPEECH_TCP_PORT=4450 or SR_SPEECH_NO_MCP=1. Flags win over the',
    'environment, which wins over the config file. See docs/configuration.md.',
    '',
  ].join('\n');
}
