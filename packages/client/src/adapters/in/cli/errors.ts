import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  ClientConfigError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from '../../../domain/errors.js';
import { EXIT, type CliIo } from './command.js';
import { NAME, UsageError } from './options.js';
import type { CliError } from './output.js';

// How a failed command ends: exit code, stderr message and, with --json, the error object on
// stdout (docs/usage/client.md#errors-with---json).

type ErrorType = CliError['error']['type'];

/** The expected errors, by the exit code they end with. */
const EXPECTED: readonly [new (...args: never[]) => Error, ErrorType, number][] = [
  [UsageError, 'UsageError', EXIT.usage],
  [ClientConfigError, 'ClientConfigError', EXIT.usage],
  [BridgeUnreachableError, 'BridgeUnreachableError', EXIT.bridge],
  [BridgeHttpError, 'BridgeHttpError', EXIT.bridge],
  [IncompatibleBridgeError, 'IncompatibleBridgeError', EXIT.bridge],
  [BridgeNotReadyError, 'BridgeNotReadyError', EXIT.timeout],
  [SpeechTimeoutError, 'SpeechTimeoutError', EXIT.timeout],
];

export interface DescribedError {
  exit: number;
  /** For stderr, without the trailing newline. */
  text: string;
  /** For stdout with --json. */
  output: CliError;
}

/** Anything a command threw; an error it doesn't expect is a bug (exit 4, with the stack). */
export function describeError(error: unknown): DescribedError {
  const known = EXPECTED.find(([type]) => error instanceof type);
  if (known === undefined || !(error instanceof Error)) {
    const stack = error instanceof Error ? (error.stack ?? error.message) : String(error);
    return {
      exit: EXIT.internal,
      text: `${NAME}: internal error, please report it: ${stack}`,
      output: { error: { type: 'InternalError', message: messageOf(error) } },
    };
  }
  const [, type, exit] = known;
  const hint = error instanceof UsageError ? '\nRun with --help to see the commands.' : '';
  const http =
    error instanceof BridgeHttpError
      ? {
          status: error.status,
          code: error.code,
          ...(error.details === undefined ? {} : { details: error.details }),
        }
      : {};
  return {
    exit,
    text: `${NAME}: ${error.message}${hint}`,
    output: { error: { type, message: error.message, ...http } },
  };
}

/** Prints `error` (stderr, and stdout with --json) and returns the exit code. */
export function reportError(error: unknown, io: CliIo, json: boolean): number {
  const { exit, text, output } = describeError(error);
  io.stderr(`${text}\n`);
  if (json) io.stdout(`${JSON.stringify(output)}\n`);
  return exit;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
