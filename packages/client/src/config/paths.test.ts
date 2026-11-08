import { describe, expect, it } from 'vitest';
import { clientConfigFile } from './paths.js';

describe('clientConfigFile', () => {
  it('uses %APPDATA% on Windows', () => {
    expect(
      clientConfigFile('win32', { APPDATA: 'C:\\Users\\t\\AppData\\Roaming' }, 'C:\\Users\\t'),
    ).toBe('C:\\Users\\t\\AppData\\Roaming\\screenreader-speech-capture\\client.json');
  });

  it('falls back to the home directory on Windows without %APPDATA%', () => {
    expect(clientConfigFile('win32', {}, 'C:\\Users\\t')).toBe(
      'C:\\Users\\t\\AppData\\Roaming\\screenreader-speech-capture\\client.json',
    );
  });

  it.each(['linux', 'darwin'] as const)('uses XDG_CONFIG_HOME or ~/.config on %s', (platform) => {
    expect(clientConfigFile(platform, { XDG_CONFIG_HOME: '/cfg' }, '/home/t')).toBe(
      '/cfg/screenreader-speech-capture/client.json',
    );
    expect(clientConfigFile(platform, {}, '/home/t')).toBe(
      '/home/t/.config/screenreader-speech-capture/client.json',
    );
  });

  it('lets SR_SPEECH_CLIENT_CONFIG override the path', () => {
    expect(clientConfigFile('linux', { SR_SPEECH_CLIENT_CONFIG: '/tmp/c.json' }, '/home/t')).toBe(
      '/tmp/c.json',
    );
  });
});
