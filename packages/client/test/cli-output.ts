// Checks the CLI's `--json` output against its schemas (src/adapters/in/cli/output.ts), so every
// test that runs a command with --json also checks the shape scripts and agents rely on.
import { checkDto } from '@screenreader-speech-capture/shared';
import { expect } from 'vitest';
import { CLI_OUTPUT, type CliCommand } from '../src/adapters/in/cli/output.js';

const COMMANDS = Object.keys(CLI_OUTPUT) as CliCommand[];

/** The command `args` run, as `CLI_OUTPUT` names it (`wait`, `session start`, …). */
export function commandOf(args: readonly string[]): CliCommand | undefined {
  const at = args.findIndex((arg) =>
    COMMANDS.some((command) => command === arg || command.startsWith(`${arg} `)),
  );
  if (at === -1) return undefined;
  const two = `${args[at]} ${args[at + 1]}`;
  if (COMMANDS.includes(two as CliCommand)) return two as CliCommand;
  return COMMANDS.includes(args[at] as CliCommand) ? (args[at] as CliCommand) : undefined;
}

/** With --json, each line of `stdout` must match the command's schema. */
export function expectCliOutput(args: readonly string[], stdout: string): void {
  if (!args.includes('--json')) return;
  const command = commandOf(args);
  if (command === undefined) return;
  for (const line of stdout.split('\n').filter((l) => l !== '')) {
    const checked = checkDto(CLI_OUTPUT[command], JSON.parse(line));
    expect(checked, `${command} --json printed ${line}`).toMatchObject({ ok: true });
  }
}
