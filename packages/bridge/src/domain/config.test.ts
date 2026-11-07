import { describe, expect, it } from 'vitest';
import { changedSections, DEFAULT_CONFIG, mergeConfig } from './config.js';
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
});

describe('changedSections', () => {
  it('lists the sections that differ', () => {
    const next = mergeConfig(DEFAULT_CONFIG, { tcp: { port: 1 }, buffer: { maxEntries: 5 } });
    expect(changedSections(DEFAULT_CONFIG, next)).toEqual(['tcp', 'buffer']);
  });
});
