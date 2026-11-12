import { spawn } from 'node:child_process';
import { once } from 'node:events';
import type { Logger } from '../../../application/ports/out/logger.js';
import { pipeLines } from './process-tree.js';

export interface RunOptions {
  cwd?: string;
  /**
   * Run through the shell, needed for `npm.cmd` on Windows. The command line is joined from
   * `command` and `args` unquoted, so they must not contain anything the shell interprets.
   */
  shell?: boolean;
  signal?: AbortSignal;
}

/** Runs a program to its end. Rejects if it fails. */
export type RunCommand = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<void>;

/** `RunCommand` that writes the program's output to `output` (stdout `info`, stderr `warn`). */
export function runCommand(output: Logger): RunCommand {
  return async (command, args, { cwd, shell = false, signal } = {}) => {
    const child = shell
      ? spawn([command, ...args].join(' '), { cwd, shell: true, signal, windowsHide: true })
      : spawn(command, [...args], { cwd, signal, windowsHide: true });
    child.stdin?.end();
    pipeLines(child, output);
    const [code, exitSignal] = (await once(child, 'close')) as [number | null, string | null];
    if (code !== 0) {
      const how = code === null ? `was killed (${exitSignal})` : `exited with code ${code}`;
      throw new Error(`${command} ${args.join(' ')} ${how}`);
    }
  };
}
