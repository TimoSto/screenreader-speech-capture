import { describe, expect, it } from 'vitest';
import { overriddenFields } from './fields.js';

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
