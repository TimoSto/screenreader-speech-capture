import { execFile, spawnSync, type ChildProcess } from 'node:child_process';
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

/** Resolves after `ms`, or when `promise` settles, whichever comes first. */
async function within(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise.catch(() => undefined),
    new Promise<void>((resolve) => (timer = setTimeout(resolve, ms))),
  ]);
  clearTimeout(timer);
}

/** One row of the Windows process table. */
export interface ProcessRow {
  readonly pid: number;
  readonly parentPid: number;
  /** Creation time, ms since the epoch. */
  readonly createdMs: number;
}

/**
 * The processes below `rootPid` in `table`, at any depth. Windows doesn't re-parent the children
 * of a dead process: they keep its pid as `parentPid`, so this finds orphans as well. Windows
 * reuses pids, so a row created before `sinceMs` (when the root started) can't be a descendant.
 */
export function findDescendants(
  table: readonly ProcessRow[],
  rootPid: number,
  sinceMs: number,
): number[] {
  const found = new Set<number>([rootPid]);
  const result: number[] = [];
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of table) {
      if (found.has(row.pid) || !found.has(row.parentPid) || row.createdMs < sinceMs) continue;
      found.add(row.pid);
      result.push(row.pid);
      grew = true;
    }
  }
  return result;
}

/** Parses the output of {@link PROCESS_TABLE_SCRIPT}: one `pid parentPid createdMs` per line. */
export function parseProcessTable(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [pid, parentPid, createdMs] = line.trim().split(/\s+/).map(Number);
    if (pid !== undefined && parentPid !== undefined && createdMs !== undefined) {
      if (Number.isFinite(pid) && Number.isFinite(parentPid) && Number.isFinite(createdMs)) {
        rows.push({ pid, parentPid, createdMs });
      }
    }
  }
  return rows;
}

const PROCESS_TABLE_SCRIPT =
  'Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { ' +
  "'{0} {1} {2}' -f $_.ProcessId, $_.ParentProcessId, " +
  '([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() }';

/** Runs a program to its end, with a deadline. Never rejects: a failure gives `ok: false`. */
export type Exec = (
  file: string,
  args: readonly string[],
  timeoutMs: number,
) => Promise<{ ok: boolean; stdout: string }>;

const exec: Exec = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(
      file,
      [...args],
      { windowsHide: true, timeout: timeoutMs, killSignal: 'SIGKILL' },
      (error, stdout) => resolve({ ok: error === null, stdout: String(stdout) }),
    );
  });

/** Test seams of {@link killTree}. */
export interface KillTreeOptions {
  platform?: NodeJS.Platform;
  exec?: Exec;
  /** How long `taskkill` and the process table query may take each. Default 5 s. */
  toolTimeoutMs?: number;
  /** How long to wait for the child's exit after it was killed. Default 5 s. */
  exitTimeoutMs?: number;
}

const TOOL_TIMEOUT_MS = 5000;

interface TrackedTree {
  readonly startedMs: number;
}

/** Trees that may still have processes, for `killAllTreesNow`. */
const trees = new Map<ChildProcess, TrackedTree>();

/**
 * Remembers a child spawned with `treeSpawnOptions`, so `killAllTreesNow` can end it when the
 * bridge has to exit without stopping gracefully. `killTree` forgets it; so does `releaseTree`.
 */
export function trackTree(child: ChildProcess): void {
  trees.set(child, { startedMs: Date.now() });
}

/** Forgets a child that ended on its own and left nothing behind to kill. */
export function releaseTree(child: ChildProcess): void {
  trees.delete(child);
}

/**
 * Ends every tracked tree at once and synchronously, without waiting for anything. For a forced
 * exit (watchdog, second Ctrl+C), when the graceful `killTree` has no time left: exiting without
 * this leaves the browsers of the Playwright server behind.
 */
export function killAllTreesNow(platform: NodeJS.Platform = process.platform): void {
  for (const child of trees.keys()) {
    const { pid } = child;
    if (pid === undefined) continue;
    if (platform === 'win32') {
      spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: TOOL_TIMEOUT_MS,
      });
    } else {
      killGroup(pid, 'SIGKILL');
    }
  }
  trees.clear();
}

/**
 * Kills `child` and every process it started (docs/usage/operations.md#shutdown). Also works for
 * a child that has already exited, because a dead child leaves its own children behind. On
 * Windows, `taskkill /T /F` (killing a process there doesn't kill its children), then the
 * orphans that `taskkill` can no longer reach through the dead parent, found in the process
 * table. Elsewhere `SIGTERM` to the process group, then `SIGKILL` to whatever is left. Resolves
 * once `child` has exited, or after a deadline if it can't be killed. Never rejects.
 * `child` must have been spawned with `treeSpawnOptions`.
 */
export async function killTree(child: ChildProcess, options: KillTreeOptions = {}): Promise<void> {
  const { platform = process.platform, toolTimeoutMs = TOOL_TIMEOUT_MS } = options;
  const { exitTimeoutMs = TOOL_TIMEOUT_MS, exec: run = exec } = options;
  const { pid } = child;
  const startedMs = trees.get(child)?.startedMs ?? 0;
  try {
    if (pid === undefined) return;
    const exited = hasExited(child) ? Promise.resolve() : once(child, 'exit');

    if (platform === 'win32') {
      const taskkill = (target: number) =>
        run('taskkill', ['/T', '/F', '/PID', String(target)], toolTimeoutMs);
      if (!hasExited(child)) await taskkill(pid);
      // The orphans of a parent that is gone (or that taskkill missed).
      const table = await run(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', PROCESS_TABLE_SCRIPT],
        toolTimeoutMs,
      );
      if (table.ok) {
        const orphans = findDescendants(parseProcessTable(table.stdout), pid, startedMs);
        await Promise.all(orphans.map(taskkill));
      }
      await within(exited, exitTimeoutMs);
      return;
    }

    killGroup(pid, 'SIGTERM');
    await within(exited, TERM_GRACE_MS);
    // Children that outlived their parent, or the parent itself after the grace period.
    killGroup(pid, 'SIGKILL');
    await within(exited, exitTimeoutMs);
  } finally {
    trees.delete(child);
  }
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
