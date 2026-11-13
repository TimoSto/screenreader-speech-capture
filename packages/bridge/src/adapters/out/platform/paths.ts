import os from 'node:os';
import { appDir } from '@screenreader-speech-capture/shared/platform-paths';

/**
 * Default bridge log file: `%LOCALAPPDATA%\screenreader-speech-capture\logs\bridge.log` on
 * Windows, `$XDG_STATE_HOME` (or `~/.local/state`) elsewhere, for development.
 */
export function defaultLogFile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  return appDir('state', ['logs', 'bridge.log'], { platform, env, home });
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
  return appDir('config', ['config.json'], { platform, env, home });
}

/**
 * Where the bridge installs Playwright versions: `%LOCALAPPDATA%\screenreader-speech-capture\
 * playwright` on Windows, `$XDG_CACHE_HOME` (or `~/.cache`) elsewhere, for development.
 */
export function defaultPlaywrightDir(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  return appDir('cache', ['playwright'], { platform, env, home });
}
