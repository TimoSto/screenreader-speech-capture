import os from 'node:os';
import path from 'node:path';

// Where the bridge and the client keep their files on disk. Shared, because the two must agree:
// the client's `client.json` sits next to the bridge's `config.json`. Node-only, so it is a
// separate entry (`@screenreader-speech-capture/shared/platform-paths`), not part of the API
// contract in `index.ts`, which the browser UI imports.

/** The folder name under each per-user base directory. */
export const APP_DIR_NAME = 'screenreader-speech-capture';

/**
 * - `config`: settings the user edits (`%APPDATA%`, `$XDG_CONFIG_HOME` or `~/.config`)
 * - `state`: data the app writes and keeps, like logs (`%LOCALAPPDATA%`, `$XDG_STATE_HOME` or
 *   `~/.local/state`)
 * - `cache`: data that can be downloaded again (`%LOCALAPPDATA%`, `$XDG_CACHE_HOME` or `~/.cache`)
 */
export type AppDirKind = 'config' | 'state' | 'cache';

/** The machine the paths are for. Tests pass their own, so they don't depend on the host. */
export interface Host {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
}

export function currentHost(): Host {
  return { platform: process.platform, env: process.env, home: os.homedir() };
}

/**
 * `<base>/screenreader-speech-capture/<...segments>` for `kind`. Windows uses `%APPDATA%` /
 * `%LOCALAPPDATA%` (or their default under the home directory); Linux and macOS use the XDG
 * directories, for development.
 */
export function appDir(
  kind: AppDirKind,
  segments: readonly string[] = [],
  { platform, env, home }: Host = currentHost(),
): string {
  if (platform === 'win32') {
    const base =
      kind === 'config'
        ? (env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'))
        : (env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'));
    return path.win32.join(base, APP_DIR_NAME, ...segments);
  }
  const xdg = {
    config: env.XDG_CONFIG_HOME ?? path.posix.join(home, '.config'),
    state: env.XDG_STATE_HOME ?? path.posix.join(home, '.local', 'state'),
    cache: env.XDG_CACHE_HOME ?? path.posix.join(home, '.cache'),
  };
  return path.posix.join(xdg[kind], APP_DIR_NAME, ...segments);
}
