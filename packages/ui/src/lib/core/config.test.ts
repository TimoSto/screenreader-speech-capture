import { describe, expect, it } from 'vitest';
import type { ConfigDto } from '@screenreader-speech-capture/shared';
import { parsePlaywrightVersion, parsePort, pendingFields } from './config.js';

const config: ConfigDto = {
  tcp: { host: '127.0.0.1', port: 4449, encoding: 'windows-1252', maxLineBytes: 65536 },
  http: { host: '127.0.0.1', port: 5151, allowedHosts: [] },
  playwright: { enabled: true, port: 3000, version: null },
  mcp: { enabled: true, port: 8931 },
  buffer: { maxEntries: 10000 },
  log: { level: 'info', file: null, consoleSpeech: false },
};

describe('pendingFields', () => {
  it('is empty when nothing was saved', () => {
    expect(pendingFields(config, structuredClone(config))).toEqual([]);
  });

  it('lists the dotted path of each setting that differs', () => {
    const saved = structuredClone(config);
    saved.tcp.port = 4450;
    saved.log.level = 'debug';
    saved.http.allowedHosts = ['vm.local'];
    expect(pendingFields(config, saved)).toEqual(['tcp.port', 'http.allowedHosts', 'log.level']);
  });
});

describe('parsePort', () => {
  it.each([
    ['4449', 4449],
    [' 1 ', 1],
    ['65535', 65535],
  ])('accepts %j', (text, port) => {
    expect(parsePort(text)).toEqual({ ok: true, port });
  });

  it.each(['', ' ', '0', '65536', '-1', '44.5', '4e3', 'abc', '99999', '000000'])(
    'refuses %j',
    (text) => {
      expect(parsePort(text)).toMatchObject({
        ok: false,
        message: 'Enter a port from 1 to 65535.',
      });
    },
  );
});

describe('parsePlaywrightVersion', () => {
  it.each([
    ['1.65.0', '1.65.0'],
    [' 1.57.0-beta-1 ', '1.57.0-beta-1'],
    ['', null],
    ['  ', null],
  ])('accepts %j', (text, version) => {
    expect(parsePlaywrightVersion(text)).toEqual({ ok: true, version });
  });

  it.each(['1.65', '^1.65.0', 'latest', 'v1.65.0', '1.65.0 && x'])('refuses %j', (text) => {
    expect(parsePlaywrightVersion(text)).toEqual({
      ok: false,
      message: 'Enter an exact version like 1.65.0, or leave the field empty.',
    });
  });
});
