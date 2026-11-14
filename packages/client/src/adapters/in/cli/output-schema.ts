// docs/cli-output.schema.json: the CLI's `--json` output as JSON Schema, generated from
// output.ts (`pnpm cli-schema`), so scripts and agents can read the shapes without the source.
import { toJsonSchemaDefs } from '@valibot/to-json-schema';
import path from 'node:path';
import {
  BridgeStatusOutput,
  CLI_OUTPUT,
  ConfigValueOutput,
  SessionListOutput,
  SessionOutput,
  SpeechEntryOutput,
  StartedSessionOutput,
} from './output.js';

/**
 * The parts several commands print, named first so references read `#/$defs/SpeechEntry`
 * rather than pointing at the first command that prints one.
 */
const PARTS = {
  SpeechEntry: SpeechEntryOutput,
  Session: SessionOutput,
  StartedSession: StartedSessionOutput,
  SessionList: SessionListOutput,
  BridgeStatus: BridgeStatusOutput,
  ConfigValue: ConfigValueOutput,
};

export const SCHEMA_FILE = path.resolve(
  import.meta.dirname,
  '../../../../../../docs/cli-output.schema.json',
);

/** One JSON Schema document; `$defs` holds each command's output, by the command as typed. */
export function cliOutputSchema(): Record<string, unknown> {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'screenreader-speech-capture-client --json output',
    description:
      'What each command prints with --json: `$defs` has one entry per command, named as typed ' +
      '(`wait`, `session start`, …), plus the parts they share (`SpeechEntry`, `Session`, …). ' +
      '`tail` prints one such object per line. Generated from ' +
      'packages/client/src/adapters/in/cli/output.ts.',
    $defs: defs(),
  };
}

function defs(): Record<string, unknown> {
  // A schema under several keys is referred to by the last one: the parts go last to win.
  const converted = toJsonSchemaDefs(
    { ...CLI_OUTPUT, ...PARTS },
    {
      target: 'draft-2020-12',
      overrideRef: ({ referenceId }) => `#/$defs/${encodeURIComponent(referenceId)}`,
    },
  );
  const parts = Object.entries(PARTS);
  const commands = Object.entries(CLI_OUTPUT).map(([command, schema]): [string, unknown] => {
    // A command that prints exactly a part (`mark` prints a `SpeechEntry`) refers to it.
    const part = parts.find(([, partSchema]) => partSchema === schema);
    return [
      command,
      part ? { $ref: `#/$defs/${part[0]}` } : converted[command as keyof typeof converted],
    ];
  });
  return Object.fromEntries([
    ...parts.map(([name]): [string, unknown] => [name, converted[name as keyof typeof converted]]),
    ...commands,
  ]);
}
