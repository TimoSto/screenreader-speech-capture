import { describe, expect, it } from 'vitest';
import {
  buildPatch,
  changedSettings,
  PLAYWRIGHT_VERSION,
  readSetting,
  TCP_PORT,
  type Setting,
} from './settings.js';
import { configWith } from '../../test/config.js';

const config = configWith();

const both: Setting[] = [TCP_PORT, PLAYWRIGHT_VERSION];

describe('readSetting', () => {
  it('reads a setting by its dotted path', () => {
    expect(readSetting(config, 'tcp.port')).toBe(4449);
    expect(readSetting(config, 'playwright.version')).toBeNull();
  });
});

describe('changedSettings', () => {
  it('ignores untouched drafts and drafts that equal the saved value', () => {
    expect(changedSettings(both, {}, config)).toEqual([]);
    expect(
      changedSettings(both, { 'tcp.port': ' 4449 ', 'playwright.version': '' }, config),
    ).toEqual([]);
  });
});

describe('buildPatch', () => {
  it('holds only the changed settings', () => {
    expect(
      buildPatch(both, { 'tcp.port': '4449', 'playwright.version': '1.64.0' }, config),
    ).toEqual({ ok: true, patch: { playwright: { version: '1.64.0' } } });
  });

  it('holds every changed setting', () => {
    expect(
      buildPatch(both, { 'tcp.port': '4450', 'playwright.version': '1.64.0' }, config),
    ).toEqual({
      ok: true,
      patch: { tcp: { port: 4450 }, playwright: { version: '1.64.0' } },
    });
  });

  it('saves nothing when one draft is unreadable, and names every such setting', () => {
    expect(buildPatch(both, { 'tcp.port': 'x', 'playwright.version': 'latest' }, config)).toEqual({
      ok: false,
      errors: {
        'tcp.port': 'Enter a port from 1 to 65535.',
        'playwright.version': 'Enter an exact version like 1.65.0, or leave the field empty.',
      },
    });
  });
});
