import { describe, expect, it } from 'vitest';
import { AppError } from '../errors.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { assertDistinctPorts, mergeConfig, mergePatch, validatePatch } from './merge.js';

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
    [{ tcp: { format: 'text-to-socket' } }, 'tcp.format'],
    [{ input: { enabled: true } }, 'input'],
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
    });
    expect(merged.tcp.encoding).toBe('shift_jis');
    expect(merged.playwright.version).toBeNull();
  });

  it('has no MCP version: the bundled one runs', () => {
    expect(fieldOf(() => mergeConfig(DEFAULT_CONFIG, { mcp: { version: '0.0.85' } }))).toBe(
      'mcp.version',
    );
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

describe('child service ports', () => {
  it('rejects port 0 for the child services, but not for the listeners', () => {
    expect(fieldOf(() => mergeConfig(DEFAULT_CONFIG, { playwright: { port: 0 } }))).toBe(
      'playwright.port',
    );
    expect(fieldOf(() => mergeConfig(DEFAULT_CONFIG, { mcp: { port: 0 } }))).toBe('mcp.port');
    expect(() =>
      mergeConfig(DEFAULT_CONFIG, { tcp: { port: 0 }, http: { port: 0 } }),
    ).not.toThrow();
  });
});

describe('assertDistinctPorts', () => {
  it('accepts the defaults and ignores port 0', () => {
    expect(() => assertDistinctPorts(DEFAULT_CONFIG)).not.toThrow();
    const zero = mergeConfig(DEFAULT_CONFIG, { tcp: { port: 0 }, http: { port: 0 } });
    expect(() => assertDistinctPorts(zero)).not.toThrow();
  });

  it('names the second field that reuses a port', () => {
    const clash = mergeConfig(DEFAULT_CONFIG, { mcp: { port: 3000 } });
    expect(fieldOf(() => assertDistinctPorts(clash))).toBe('mcp.port');
    const withBridge = mergeConfig(DEFAULT_CONFIG, { playwright: { port: 5151 } });
    expect(fieldOf(() => assertDistinctPorts(withBridge))).toBe('playwright.port');
  });

  it('ignores a disabled service', () => {
    const config = mergeConfig(DEFAULT_CONFIG, { mcp: { port: 3000, enabled: false } });
    expect(() => assertDistinctPorts(config)).not.toThrow();
  });
});

describe('mergeConfig prototype keys', () => {
  it.each(['valueOf', 'constructor', 'toString', '__proto__'])(
    'rejects %s as an unknown setting, not a crash',
    (key) => {
      const section = JSON.parse(`{"${key}": 1}`) as object;
      expect(() => mergeConfig(DEFAULT_CONFIG, { tcp: section })).toThrow(/unknown setting/);
      const patch = JSON.parse(`{"${key}": {}}`) as object;
      expect(() => mergeConfig(DEFAULT_CONFIG, patch)).toThrow(/unknown setting/);
    },
  );
});
