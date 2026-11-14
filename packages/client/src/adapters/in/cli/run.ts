import { parseArgs } from 'node:util';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  ClientConfigError,
  IncompatibleBridgeError,
} from '../../../domain/errors.js';
import { EXIT, type CliIo, type Context } from './command.js';
import { COMMANDS } from './commands/index.js';
import { helpText } from './help.js';
import { NAME, OPTIONS, UsageError, checkOptions } from './options.js';

export { EXIT, type CliIo } from './command.js';
export { helpText } from './help.js';

/** Runs one CLI invocation and returns its exit code. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    return await dispatch(argv, io);
  } catch (error) {
    const code = exitCode(error);
    if (code === undefined) throw error;
    const hint = error instanceof UsageError ? '\nRun with --help to see the commands.' : '';
    io.stderr(`${NAME}: ${(error as Error).message}${hint}\n`);
    return code;
  }
}

/** The exit code for an expected error, `undefined` for a bug. */
function exitCode(error: unknown): number | undefined {
  if (error instanceof UsageError || error instanceof ClientConfigError) return EXIT.usage;
  if (error instanceof BridgeNotReadyError) return EXIT.timeout;
  if (
    error instanceof BridgeUnreachableError ||
    error instanceof BridgeHttpError ||
    error instanceof IncompatibleBridgeError
  ) {
    return EXIT.bridge;
  }
  return undefined;
}

async function dispatch(argv: readonly string[], io: CliIo): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({ args: [...argv], allowPositionals: true, options: OPTIONS });
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

  const [name, ...args] = positionals;
  if (name === undefined) throw new UsageError('Missing command.');
  const command = Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command === undefined) throw new UsageError(`Unknown command "${name}".`);
  checkOptions(name, command.options, values);

  let client: SpeechCapture | undefined;
  const ctx: Context = {
    values,
    json: values.json,
    io,
    speech: () => (client ??= io.speech(values.url)),
    out: (_command, json, text) =>
      io.stdout(values.json ? `${JSON.stringify(json)}\n` : `${text}\n`),
  };
  return command.run(args, ctx);
}
