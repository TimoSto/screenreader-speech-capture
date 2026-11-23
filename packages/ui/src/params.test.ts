import { describe, expect, it } from 'vitest';
import { parseScope } from '#lib/core/sessions.js';
import { params } from './params';

const matchId = (param: string): unknown => {
  const result = params.id['~standard'].validate(param);
  if (result instanceof Promise) throw new Error('the id matcher is synchronous');
  return result.issues === undefined ? result.value : undefined;
};

describe('params.id', () => {
  it('matches what parseScope reads as a session id, as a number', () => {
    for (const value of [
      '7',
      '1',
      '9007199254740991',
      '0',
      '007',
      '-1',
      '1.5',
      'abc',
      'none',
      '',
    ]) {
      const scope = parseScope(value);
      expect(matchId(value), value).toBe(typeof scope === 'number' ? scope : undefined);
    }
  });
});
