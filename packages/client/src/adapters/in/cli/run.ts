import { parseArgs } from 'node:util';
import type { NativeInput } from '../../../application/ports/in/native-input.js';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import { EXIT, type CliIo, type Context } from './command.js';
import { COMMANDS } from './commands/index.js';
import { reportError } from './errors.js';
import { commandHelp, helpText } from './help.js';
import { OPTIONS, UsageError, checkOptions } from './options.js';

export { EXIT, type CliIo } from './command.js';
export { helpText } from './help.js';

/**
 * Runs one CLI invocation and returns its exit code. Never rejects: an error a command doesn't
 * expect is a bug and ends with exit code 4, not with Node's 1 ("no match").
 */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  // Known once the arguments parse; if they don't, a plain --json among them counts.
  const state = { json: argv.includes('--json') };
  try {
    return await dispatch(argv, io, state);
  } catch (error) {
    return reportError(error, io, state.json);
  }
}

async function dispatch(
  argv: readonly string[],
  io: CliIo,
  state: { json: boolean },
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], allowPositionals: true, options: OPTIONS });
  } catch (error) {
    throw new UsageError((error as Error).message);
  }
  const { values, positionals } = parsed;
  state.json = values.json;
  const [name, ...args] = positionals;
  const command = name !== undefined && Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (values.help) {
    if (name === undefined) io.stdout(helpText());
    else if (command === undefined) throw new UsageError(`Unknown command "${name}".`);
    else io.stdout(commandHelp(name, command));
    return EXIT.ok;
  }
  if (values.version) {
    io.stdout(`${io.version}\n`);
    return EXIT.ok;
  }

  if (name === undefined) throw new UsageError('Missing command.');
  if (command === undefined) throw new UsageError(`Unknown command "${name}".`);
  checkOptions(name, command.options, values);

  let client: SpeechCapture | undefined;
  let input: NativeInput | undefined;
  const ctx: Context = {
    values,
    json: values.json,
    io,
    speech: () => (client ??= io.speech(values.url)),
    input: () => (input ??= io.input(values.url)),
    out: (_command, json, text) =>
      io.stdout(values.json ? `${JSON.stringify(json)}\n` : `${text}\n`),
  };
  return command.run(args, ctx);
}
