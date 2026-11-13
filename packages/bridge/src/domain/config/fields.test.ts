import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './defaults.js';
import { changedFields, changedSections, overriddenFields } from './fields.js';
import { mergeConfig } from './merge.js';

describe('changedSections', () => {
  it('lists the sections that differ', () => {
    const next = mergeConfig(DEFAULT_CONFIG, { tcp: { port: 1 }, buffer: { maxEntries: 5 } });
    expect(changedSections(DEFAULT_CONFIG, next)).toEqual(['tcp', 'buffer']);
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
