import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import readline from 'node:readline';
import type { Logger } from '../../../application/ports/out/logger.js';

/** How long the process group gets after `SIGTERM` before `SIGKILL` (not on Windows). */
const TERM_GRACE_MS = 3000;

/**
 * Spawn options for a child whose whole tree `killTree` can end. On POSIX the child leads its own
 * process group. On Windows that isn't needed (`taskkill /T` walks the tree), and `detached`
 * there would open a new console window.
 */
export const treeSpawnOptions = {
  detached: process.platform !== 'win32',
  windowsHide: true,
} as const;

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

function killGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group is already gone.
  }
}

/**
 * Kills `child` and every process it started (docs/operations.md#shutdown). On Windows,
 * `taskkill /T /F` (killing a process there doesn't kill its children). Elsewhere `SIGTERM`
 * to the process group, then `SIGKILL` to whatever is left. Resolves once `child` has exited.
 * `child` must have been spawned with `treeSpawnOptions`.
 */
export async function killTree(child: ChildProcess): Promise<void> {
  const { pid } = child;
  if (pid === undefined) return;
  const exited = hasExited(child) ? Promise.resolve() : once(child, 'exit').then(() => undefined);

  if (process.platform === 'win32') {
    if (!hasExited(child)) {
      const taskkill = spawn('taskkill', ['/T', '/F', '/PID', String(pid)], {
        windowsHide: true,
        stdio: 'ignore',
      });
      await once(taskkill, 'close').catch(() => undefined);
    }
    await exited;
    return;
  }

  killGroup(pid, 'SIGTERM');
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    exited,
    new Promise<void>((resolve) => (timer = setTimeout(resolve, TERM_GRACE_MS))),
  ]);
  clearTimeout(timer);
  // Children that outlived their parent, or the parent itself after the grace period.
  killGroup(pid, 'SIGKILL');
  await exited;
}

/** Writes each line of the child's stdout as `info` and of its stderr as `warn`. */
export function pipeLines(child: ChildProcess, output: Logger): void {
  if (child.stdout) {
    readline
      .createInterface({ input: child.stdout, crlfDelay: Infinity })
      .on('line', (line) => output.info(line));
  }
  if (child.stderr) {
    readline
      .createInterface({ input: child.stderr, crlfDelay: Infinity })
      .on('line', (line) => output.warn(line));
  }
}
