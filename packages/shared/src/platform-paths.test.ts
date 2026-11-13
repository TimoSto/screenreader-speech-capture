import { describe, expect, it } from 'vitest';
import { appDir, type Host } from './platform-paths.js';

const windows = (env: NodeJS.ProcessEnv = {}): Host => ({
  platform: 'win32',
  env,
  home: 'C:\\Users\\t',
});
const linux = (env: NodeJS.ProcessEnv = {}): Host => ({ platform: 'linux', env, home: '/home/t' });

describe('appDir on Windows', () => {
  it('puts config under %APPDATA%, state and cache under %LOCALAPPDATA%', () => {
    const host = windows({ APPDATA: 'D:\\Roaming', LOCALAPPDATA: 'D:\\Local' });
    expect(appDir('config', ['config.json'], host)).toBe(
      'D:\\Roaming\\screenreader-speech-capture\\config.json',
    );
    expect(appDir('state', ['logs', 'bridge.log'], host)).toBe(
      'D:\\Local\\screenreader-speech-capture\\logs\\bridge.log',
    );
    expect(appDir('cache', [], host)).toBe('D:\\Local\\screenreader-speech-capture');
  });

  it('falls back to the AppData folders in the home directory', () => {
    expect(appDir('config', [], windows())).toBe(
      'C:\\Users\\t\\AppData\\Roaming\\screenreader-speech-capture',
    );
    expect(appDir('state', [], windows())).toBe(
      'C:\\Users\\t\\AppData\\Local\\screenreader-speech-capture',
    );
    expect(appDir('cache', [], windows())).toBe(
      'C:\\Users\\t\\AppData\\Local\\screenreader-speech-capture',
    );
  });
});

describe.each(['linux', 'darwin'] as const)('appDir on %s', (platform) => {
  it('uses the XDG variables', () => {
    const host = {
      ...linux({ XDG_CONFIG_HOME: '/cfg', XDG_STATE_HOME: '/state', XDG_CACHE_HOME: '/cache' }),
      platform,
    };
    expect(appDir('config', ['a'], host)).toBe('/cfg/screenreader-speech-capture/a');
    expect(appDir('state', ['a'], host)).toBe('/state/screenreader-speech-capture/a');
    expect(appDir('cache', ['a'], host)).toBe('/cache/screenreader-speech-capture/a');
  });

  it('falls back to the XDG defaults in the home directory', () => {
    const host = { ...linux(), platform };
    expect(appDir('config', [], host)).toBe('/home/t/.config/screenreader-speech-capture');
    expect(appDir('state', [], host)).toBe('/home/t/.local/state/screenreader-speech-capture');
    expect(appDir('cache', [], host)).toBe('/home/t/.cache/screenreader-speech-capture');
  });
});
