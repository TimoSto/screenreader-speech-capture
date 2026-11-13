import os from 'node:os';
import { appDir } from '@screenreader-speech-capture/shared/platform-paths';

/** Environment variable that points the client at a different config file. */
export const CONFIG_PATH_ENV = 'SR_SPEECH_CLIENT_CONFIG';

/**
 * The client's config file: `%APPDATA%\screenreader-speech-capture\client.json` on Windows,
 * `$XDG_CONFIG_HOME` (or `~/.config`) + `screenreader-speech-capture/client.json` on Linux and
 * macOS. It sits next to the bridge's `config.json` (both come from `appDir('config')` in
 * `packages/shared`) but is a separate file, so a bridge and a client on the same machine never
 * share settings. `SR_SPEECH_CLIENT_CONFIG` overrides the path.
 */
export function clientConfigFile(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir(),
): string {
  const override = env[CONFIG_PATH_ENV];
  if (override !== undefined && override !== '') return override;
  return appDir('config', ['client.json'], { platform, env, home });
}
