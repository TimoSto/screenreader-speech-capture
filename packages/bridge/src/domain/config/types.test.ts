import { describe, expectTypeOf, it } from 'vitest';
import type { ConfigField } from './types.js';

describe('ConfigField', () => {
  it('names only real settings', () => {
    expectTypeOf<'tcp.port'>().toExtend<ConfigField>();
    expectTypeOf<'log.consoleSpeech'>().toExtend<ConfigField>();
    expectTypeOf<'tcp.prot'>().not.toExtend<ConfigField>();
    expectTypeOf<'http.encoding'>().not.toExtend<ConfigField>();
    expectTypeOf<'nope.port'>().not.toExtend<ConfigField>();
  });
});
