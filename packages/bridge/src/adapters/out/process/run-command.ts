import { spawn } from 'node:child_process';
import type { Logger } from '../../../application/ports/out/logger.js';
import { killTree, pipeLines, releaseTree, trackTree, treeSpawnOptions } from './process-tree.js';

export interface RunOptions {
  cwd?: string;
  /**
   * Run through the shell, needed for `npm.cmd` on Windows. The command line is joined from
   * `command` and `args` unquoted, so they must not contain anything the shell interprets.
   */
  shell?: boolean;
  signal?: AbortSignal;
  /** Longest the program may run. It is killed with everything it started. Default 10 minutes. */
  timeoutMs?: number;
}

/** Longest an install step may take (a slow connection downloading Chromium included). */
export const RUN_TIMEOUT_MS = 10 * 60_000;

/** Runs a program to its end. Rejects if it fails. */
export type RunCommand = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<void>;

/**
 * `RunCommand` that writes the program's output to `output` (stdout `info`, stderr `warn`). The
 * program runs in its own process tree, which ends when `signal` aborts or `timeoutMs` passes:
 * on Windows the default kill would only end `cmd.exe` and leave npm running.
 */
export function runCommand(output: Logger): RunCommand {
  return async (command, args, { cwd, shell = false, signal, timeoutMs = RUN_TIMEOUT_MS } = {}) => {
    signal?.throwIfAborted();
    const child = shell
      ? spawn([command, ...args].join(' '), { cwd, shell: true, ...treeSpawnOptions })
      : spawn(command, [...args], { cwd, ...treeSpawnOptions });
    trackTree(child);
    child.stdin?.end();
    pipeLines(child, output);

    let ended: 'aborted' | 'timeout' | undefined;
    const end = (why: 'aborted' | 'timeout') => {
      ended ??= why;
      void killTree(child);
    };
    const onAbort = () => end('aborted');
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => end('timeout'), timeoutMs);
    const line = `${command} ${args.join(' ')}`;
    try {
      const [code, exitSignal] = await new Promise<[number | null, string | null]>(
        (resolve, reject) => {
          child.once('error', reject);
          child.once('close', (c: number | null, s: string | null) => resolve([c, s]));
        },
      );
      if (ended === 'timeout') {
        throw new Error(`${line} did not finish within ${Math.round(timeoutMs / 1000)} s`);
      }
      if (ended === 'aborted') throw new Error(`${line} was stopped`);
      if (code !== 0) {
        const how = code === null ? `was killed (${exitSignal})` : `exited with code ${code}`;
        throw new Error(`${line} ${how}`);
      }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      // Normally gone already; after an abort or timeout `killTree` has the final say.
      if (ended === undefined) releaseTree(child);
    }
  };
}
