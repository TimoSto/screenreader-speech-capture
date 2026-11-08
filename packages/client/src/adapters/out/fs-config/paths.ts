import os from 'node:os';
import path from 'node:path';

const APP = 'screenreader-speech-capture';

/** Environment variable that points the client at a different config file. */
export const CONFIG_PATH_ENV = 'SR_SPEECH_CLIENT_CONFIG';

/**
 * The client's config file: `%APPDATA%\screenreader-speech-capture\client.json` on Windows,
 * `$XDG_CONFIG_HOME` (or `~/.config`) + `screenreader-speech-capture/client.json` on Linux and
 * macOS. It sits next to the bridge's `config.json` but is a separate file, so a bridge and a
 * client on the same machine never share settings. `SR_SPEECH_CLIENT_CONFIG` overrides the path.
 */
export function clientConfigFile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  const override = env[CONFIG_PATH_ENV];
  if (override !== undefined && override !== '') return override;
  if (platform === 'win32') {
    const base = env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(base, APP, 'client.json');
  }
  const base = env.XDG_CONFIG_HOME ?? path.posix.join(home, '.config');
  return path.posix.join(base, APP, 'client.json');
}
