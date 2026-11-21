import { spawn } from 'node:child_process';
import path from 'node:path';

/** What the respawner needs from `process`, so tests can pass a fake. */
export interface RespawnProcess {
  readonly execPath: string;
  readonly execArgv: readonly string[];
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
}

/** Set to a non-empty value to turn the restart off (development, or a supervisor does it). */
export const NO_RESPAWN_ENV = 'SR_SPEECH_NO_RESPAWN';

/**
 * Only a bundled `.mjs`/`.js` entry can be started again with `node <entry>`. A source file run
 * by `tsx` (`pnpm dev`) is restarted by its watcher instead.
 */
export function canRespawn(proc: RespawnProcess): boolean {
  if ((proc.env[NO_RESPAWN_ENV] ?? '') !== '') return false;
  const entry = proc.argv[1];
  return entry !== undefined && ['.mjs', '.js', '.cjs'].includes(path.extname(entry));
}

/**
 * Starts a detached copy of this process with the same arguments and environment
 * (docs/usage/operations.md#restarting-the-bridge). It stays in the same user session, which the
 * screen reader and native input need. Call it only after the bridge stopped, so the ports are free.
 */
export function respawnSelf(proc: RespawnProcess = process): void {
  const [, entry = '', ...args] = proc.argv;
  const child = spawn(proc.execPath, [...proc.execArgv, entry, ...args], {
    detached: true,
    stdio: 'ignore',
    env: proc.env,
    windowsHide: true,
  });
  // A failure to spawn arrives as an event: without a handler it would crash the old process.
  child.on('error', () => undefined);
  child.unref();
}
