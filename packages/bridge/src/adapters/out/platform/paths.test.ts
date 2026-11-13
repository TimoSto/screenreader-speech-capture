import { describe, expect, it } from 'vitest';
import { defaultConfigFile, defaultLogFile, defaultPlaywrightDir } from './paths.js';

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

describe('defaultPlaywrightDir', () => {
  it('uses %LOCALAPPDATA% on Windows', () => {
    expect(
      defaultPlaywrightDir(
        'win32',
        { LOCALAPPDATA: 'C:\\Users\\t\\AppData\\Local' },
        'C:\\Users\\t',
      ),
    ).toBe('C:\\Users\\t\\AppData\\Local\\screenreader-speech-capture\\playwright');
  });

  it('uses XDG_CACHE_HOME or ~/.cache elsewhere', () => {
    expect(defaultPlaywrightDir('linux', { XDG_CACHE_HOME: '/cache' }, '/home/t')).toBe(
      '/cache/screenreader-speech-capture/playwright',
    );
    expect(defaultPlaywrightDir('linux', {}, '/home/t')).toBe(
      '/home/t/.cache/screenreader-speech-capture/playwright',
    );
  });
});

describe('defaults on a Windows machine without the AppData variables', () => {
  it('falls back to the AppData folders in the home directory', () => {
    expect(defaultConfigFile('win32', {}, 'C:\\Users\\t')).toBe(
      'C:\\Users\\t\\AppData\\Roaming\\screenreader-speech-capture\\config.json',
    );
    expect(defaultLogFile('win32', {}, 'C:\\Users\\t')).toBe(
      'C:\\Users\\t\\AppData\\Local\\screenreader-speech-capture\\logs\\bridge.log',
    );
  });
});
