import os from 'node:os';
import path from 'node:path';

const APP = 'screenreader-speech-capture';

/**
 * Default bridge log file: `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log` on
 * Windows, `$XDG_STATE_HOME` (or `~/.local/state`) elsewhere, for development.
 */
export function defaultLogFile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  if (platform === 'win32') {
    const base = env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local');
    return path.win32.join(base, APP, 'logs', 'bridge.log');
  }
  const base = env.XDG_STATE_HOME ?? path.posix.join(home, '.local', 'state');
  return path.posix.join(base, APP, 'logs', 'bridge.log');
}

/**
 * Default config file: `%APPDATA%\screenreader-speech-capture\config.json` on Windows,
 * `$XDG_CONFIG_HOME` (or `~/.config`) elsewhere, for development.
 */
export function defaultConfigFile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  if (platform === 'win32') {
    const base = env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(base, APP, 'config.json');
  }
  const base = env.XDG_CONFIG_HOME ?? path.posix.join(home, '.config');
  return path.posix.join(base, APP, 'config.json');
}
