import { describe, expect, it } from 'vitest';
import { defaultConfigFile, defaultLogFile } from './paths.js';

describe('defaultLogFile', () => {
  it('uses %LOCALAPPDATA% on Windows', () => {
    expect(
      defaultLogFile('win32', { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' }, 'C:\\Users\\t'),
    ).toBe('C:\\Users\\t\\AppData\\Local\\screenreader-speech-capture\\logs\\bridge.log');
  });

  it('uses XDG_STATE_HOME or ~/.local/state elsewhere', () => {
    expect(defaultLogFile('linux', { XDG_STATE_HOME: '/state' }, '/home/t')).toBe(
      '/state/screenreader-speech-capture/logs/bridge.log',
    );
    expect(defaultLogFile('linux', {}, '/home/t')).toBe(
      '/home/t/.local/state/screenreader-speech-capture/logs/bridge.log',
    );
  });
});

describe('defaultConfigFile', () => {
  it('uses %APPDATA% on Windows', () => {
    expect(
      defaultConfigFile('win32', { APPDATA: 'C:\\Users\\t\\AppData\\Roaming' }, 'C:\\Users\\t'),
    ).toBe('C:\\Users\\t\\AppData\\Roaming\\screenreader-speech-capture\\config.json');
  });

  it('uses XDG_CONFIG_HOME or ~/.config elsewhere', () => {
    expect(defaultConfigFile('linux', { XDG_CONFIG_HOME: '/cfg' }, '/home/t')).toBe(
      '/cfg/screenreader-speech-capture/config.json',
    );
    expect(defaultConfigFile('linux', {}, '/home/t')).toBe(
      '/home/t/.config/screenreader-speech-capture/config.json',
    );
  });
});
