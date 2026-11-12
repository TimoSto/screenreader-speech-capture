import { describe, expect, it } from 'vitest';
import {
  changedFields,
  changedSections,
  DEFAULT_CONFIG,
  mergeConfig,
  mergePatch,
  overriddenFields,
  validatePatch,
} from './config.js';
import { AppError } from './errors.js';

function fieldOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe('INVALID_REQUEST');
    return (error as AppError).details?.field;
  }
  throw new Error('expected an error');
}

describe('mergeConfig', () => {
  it('returns the base for an empty patch', () => {
    expect(mergeConfig(DEFAULT_CONFIG, undefined)).toBe(DEFAULT_CONFIG);
    expect(mergeConfig(DEFAULT_CONFIG, {})).toEqual(DEFAULT_CONFIG);
  });

  it('merges per section and keeps the other values', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { tcp: { port: 5000 }, log: { level: 'debug' } });
    expect(merged.tcp).toEqual({ ...DEFAULT_CONFIG.tcp, port: 5000 });
    expect(merged.log.level).toBe('debug');
    expect(merged.http).toEqual(DEFAULT_CONFIG.http);
  });

  it('does not change the base', () => {
    mergeConfig(DEFAULT_CONFIG, { tcp: { port: 5000 } });
    expect(DEFAULT_CONFIG.tcp.port).toBe(4449);
  });

  it.each([
    [{ tcp: { port: 70000 } }, 'tcp.port'],
    [{ tcp: { port: 1.5 } }, 'tcp.port'],
    [{ tcp: { encoding: 'no-such-encoding' } }, 'tcp.encoding'],
    [{ tcp: { format: 'other' } }, 'tcp.format'],
    [{ http: { host: '' } }, 'http.host'],
    [{ log: { level: 'trace' } }, 'log.level'],
    [{ buffer: { maxEntries: 0 } }, 'buffer.maxEntries'],
    [{ playwright: { enabled: 'yes' } }, 'playwright.enabled'],
    [{ tcp: { colour: 'red' } }, 'tcp.colour'],
    [{ nope: {} }, 'nope'],
    [{ tcp: 4449 }, 'tcp'],
  ])('rejects %j (field %s)', (patch, field) => {
    expect(fieldOf(() => mergeConfig(DEFAULT_CONFIG, patch))).toBe(field);
  });

  it('accepts other code pages and null versions', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {
      tcp: { encoding: 'shift_jis' },
      playwright: { version: null },
      mcp: { version: '0.0.40' },
    });
    expect(merged.tcp.encoding).toBe('shift_jis');
    expect(merged.mcp.version).toBe('0.0.40');
  });

  it.each(['1.56', 'latest', '^1.56.1', '1.56.1 && calc', '1.56.1;x', ' 1.56.1'])(
    'rejects the version %j',
    (version) => {
      expect(fieldOf(() => mergeConfig(DEFAULT_CONFIG, { playwright: { version } }))).toBe(
        'playwright.version',
      );
    },
  );

  it('accepts prerelease versions', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, { playwright: { version: '1.57.0-beta-1' } });
    expect(merged.playwright.version).toBe('1.57.0-beta-1');
  });
});

describe('changedSections', () => {
  it('lists the sections that differ', () => {
    const next = mergeConfig(DEFAULT_CONFIG, { tcp: { port: 1 }, buffer: { maxEntries: 5 } });
    expect(changedSections(DEFAULT_CONFIG, next)).toEqual(['tcp', 'buffer']);
  });
});

describe('validatePatch', () => {
  it('keeps the given values and drops undefined ones', () => {
    expect(validatePatch({ tcp: { port: 1, host: undefined }, log: {} })).toEqual({
      tcp: { port: 1 },
    });
    expect(validatePatch(undefined)).toEqual({});
  });

  it('rejects invalid and unknown settings, naming the field', () => {
    expect(fieldOf(() => validatePatch({ tcp: { port: -1 } }))).toBe('tcp.port');
    expect(fieldOf(() => validatePatch({ tcp: { nope: 1 } }))).toBe('tcp.nope');
  });
});

describe('mergePatch', () => {
  it('puts the patch on top of the base, per setting', () => {
    expect(
      mergePatch({ tcp: { port: 1, host: 'a' }, log: { level: 'debug' } }, { tcp: { port: 2 } }),
    ).toEqual({ tcp: { port: 2, host: 'a' }, log: { level: 'debug' } });
  });
});

describe('changedFields', () => {
  it('lists each changed setting with both values', () => {
    const next = mergeConfig(DEFAULT_CONFIG, {
      tcp: { port: 1 },
      playwright: { version: '1.0.0' },
    });
    expect(changedFields(DEFAULT_CONFIG, next)).toEqual([
      { field: 'tcp.port', from: 4449, to: 1 },
      { field: 'playwright.version', from: null, to: '1.0.0' },
    ]);
  });
});

describe('overriddenFields', () => {
  it('lists the settings that both the file and the overrides set', () => {
    expect(
      overriddenFields(
        { tcp: { port: 1, host: 'a' }, log: { level: 'debug' } },
        { tcp: { port: 2 }, http: { port: 3 } },
      ),
    ).toEqual([{ field: 'tcp.port', file: 1, override: 2 }]);
  });
});
