// `--help --json`: the commands, their options and the JSON Schema of their `--json` output, so an
// agent learns the CLI from the same valibot schemas the output is checked against
// (docs/usage/client.md#cli-for-agents).
import { toJsonSchema } from '@valibot/to-json-schema';
import type * as v from 'valibot';
import { URL_ENV } from '../../../domain/bridge-url.js';
import { OUTPUT_ENV } from '../../../domain/output-format.js';
import { EXIT, type Command } from './command.js';
import { COMMANDS } from './commands/index.js';
import { CLI_OUTPUT, CliErrorOutput, type CliCommand, type HelpOutput } from './output.js';
import { GLOBAL_OPTIONS, NAME, OPTIONS } from './options.js';

type Help = v.InferOutput<typeof HelpOutput>;

const schema = (s: v.GenericSchema) =>
  // Rules JSON Schema can't express stay in the descriptions, as in the OpenAPI spec.
  toJsonSchema(s, { target: 'draft-2020-12', ignoreActions: ['check'] }) as Record<string, unknown>;

function describeCommand(name: string, command: Command): Help['commands'][number] {
  const outputs = (Object.keys(CLI_OUTPUT) as CliCommand[]).filter(
    (key) => key === name || key.startsWith(`${name} `),
  );
  return {
    name,
    usage: command.help.map(({ usage, description }) => ({
      usage,
      description: description.join(' '),
    })),
    options: command.options.map((option) => ({ name: option, type: OPTIONS[option].type })),
    outputs: Object.fromEntries(outputs.map((key) => [key, schema(CLI_OUTPUT[key])])),
  };
}

/** Every command, or only `command` (`<command> --help --json`). */
export function helpJson(version: string, only?: { name: string; command: Command }): Help {
  const commands = only ? [[only.name, only.command] as const] : Object.entries(COMMANDS);
  return {
    name: NAME,
    version,
    commands: commands.map(([name, command]) => describeCommand(name, command)),
    globalOptions: GLOBAL_OPTIONS.map(({ option, flag, description }) => ({
      name: option,
      flag,
      description,
    })),
    error: schema(CliErrorOutput),
    exitCodes: { ...EXIT },
    env: {
      [URL_ENV]: 'The bridge URL (below --url, above the config file).',
      [OUTPUT_ENV]: 'json or text: the output without --json (above the config file).',
      // CONFIG_PATH_ENV in adapters/out/fs-config, which an in adapter may not import.
      SR_SPEECH_CLIENT_CONFIG: 'The client config file to use.',
    },
  };
}
