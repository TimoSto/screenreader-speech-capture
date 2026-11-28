import { describe, expect, it } from 'vitest';
import {
  buildPatch,
  changedSettings,
  explainRejection,
  isPending,
  PLAYWRIGHT_VERSION,
  readSetting,
  selectOptions,
  TCP_PORT,
  TEXT_ENCODING,
  waitingForRestart,
  type Setting,
} from './settings.js';
import { configWith } from '../../test/config.js';
import { SettingRejected } from './config.js';

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

describe('help', () => {
  const running = { runningPlaywright: '1.65.0' };

  it('names the bundled Playwright version only while it is the one that runs', () => {
    expect(PLAYWRIGHT_VERSION.help(null, running)).toContain('bundled version (1.65.0).');
    expect(PLAYWRIGHT_VERSION.help('1.64.0', running)).toMatch(/bundled version\.$/);
  });
});

describe('isPending', () => {
  const saved = configWith({ tcp: { port: 4450 } });

  it('is true for a saved value that differs, unless a flag sets the setting', () => {
    expect(isPending('tcp.port', config, saved, {})).toBe(true);
    expect(isPending('tcp.port', config, config, {})).toBe(false);
    expect(isPending('tcp.port', config, saved, { 'tcp.port': '--tcp-port' })).toBe(false);
  });
});

describe('waitingForRestart', () => {
  const context = { runningPlaywright: '1.64.0' };

  it('is empty when nothing was saved', () => {
    expect(waitingForRestart(config, config, {}, context)).toEqual([]);
  });

  it('describes each change in words, with what to know about it', () => {
    const active = configWith({ playwright: { version: '1.64.0' } });
    const [change] = waitingForRestart(active, config, {}, context);
    expect(change).toMatchObject({
      label: 'Playwright version',
      from: '1.64.0',
      to: 'bundled version',
    });
    expect(change?.consequence.filter((part) => typeof part === 'string').join('')).toContain(
      'Your test projects need the same version.',
    );
  });

  it('lists a setting without a field by its path', () => {
    const saved = configWith({ buffer: { maxEntries: 5 } });
    expect(waitingForRestart(config, saved, {}, context)).toEqual([
      {
        path: 'buffer.maxEntries',
        label: 'buffer.maxEntries',
        from: '10000',
        to: '5',
        consequence: [],
      },
    ]);
  });

  it('leaves out what a flag or variable sets', () => {
    const saved = configWith({ tcp: { port: 4450 } });
    expect(waitingForRestart(config, saved, { 'tcp.port': '--tcp-port' }, context)).toEqual([]);
  });
});

describe('the text encodings', () => {
  const { control } = TEXT_ENCODING;
  const options = control.kind === 'select' ? control.options : [];

  // The bridge checks a label with `TextDecoder` too.
  it.each(options.map((option) => option.value))('%s can be decoded', (label) => {
    expect(() => new TextDecoder(label)).not.toThrow();
  });

  it('keeps a saved label that is not in the list as one more option', () => {
    expect(selectOptions(options, 'windows-1252')).toBe(options);
    expect(selectOptions(options, 'cp1252').at(-1)).toEqual({ value: 'cp1252', label: 'cp1252' });
  });
});

describe('explainRejection', () => {
  const form = [TCP_PORT, TEXT_ENCODING];
  const rejected = (field: string, message: string) =>
    new SettingRejected(`${field}: ${message}`, field);

  it('puts it on the named field, in words', () => {
    expect(explainRejection(rejected('tcp.encoding', 'unsupported'), form)).toEqual({
      field: 'tcp.encoding',
      message: 'Text encoding: unsupported. Nothing was saved.',
    });
  });

  it('puts a port clash on the field the message names', () => {
    const cause = rejected('playwright.port', 'port 3000 is already used by tcp.port');
    expect(explainRejection(cause, form)).toEqual({
      field: 'tcp.port',
      message: 'playwright.port: port 3000 is already used by TCP port. Nothing was saved.',
    });
  });

  it('leaves it to the form when no field of it is named', () => {
    const cause = rejected('mcp.port', 'port 5151 is already used by http.port');
    expect(explainRejection(cause, form).field).toBeNull();
  });

  it('keeps any other failure as it is', () => {
    expect(explainRejection(new Error('The bridge is not reachable'), form)).toEqual({
      field: null,
      message: 'The bridge is not reachable',
    });
    expect(explainRejection(undefined, form).message).toBe('The settings could not be saved.');
  });
});
