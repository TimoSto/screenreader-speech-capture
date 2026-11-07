import { describe, expect, it } from 'vitest';
import { AppError } from '../../../domain/errors.js';
import { booleanParam, intParam, Router } from './router.js';

const url = (query: string) => new URL(`http://bridge/x?${query}`);
describe('intParam', () => {
  it('is undefined when missing or empty', () => {
    expect(intParam(url(''), 'n')).toBeUndefined();
    expect(intParam(url('n='), 'n')).toBeUndefined();
  });

  it('parses integers, leaving the range to the application', () => {
    expect(intParam(url('n=0'), 'n')).toBe(0);
    expect(intParam(url('n=-1'), 'n')).toBe(-1);
    expect(intParam(url('n=10000'), 'n')).toBe(10000);
  });

  it.each(['1.5', 'abc', '1e3', ' 1'])('rejects %s, naming the field', (value) => {
    expect(() => intParam(url(`n=${encodeURIComponent(value)}`), 'n')).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST', details: { field: 'n' } }) as Error,
    );
  });
});

describe('booleanParam', () => {
  it('accepts 1/true/0/false and treats missing as undefined', () => {
    expect(booleanParam(url('b=1'), 'b')).toBe(true);
    expect(booleanParam(url('b=true'), 'b')).toBe(true);
    expect(booleanParam(url('b=0'), 'b')).toBe(false);
    expect(booleanParam(url('b=false'), 'b')).toBe(false);
    expect(booleanParam(url(''), 'b')).toBeUndefined();
    expect(() => booleanParam(url('b=yes'), 'b')).toThrow(AppError);
  });
});

describe('Router', () => {
  it('finds handlers by method and exact path, NOT_FOUND otherwise', () => {
    const handler = () => {};
    const router = new Router().add('GET', '/a', handler);
    expect(router.find('GET', '/a')).toBe(handler);
    expect(() => router.find('POST', '/a')).toThrow('Unknown endpoint POST /a');
    expect(() => router.find('GET', '/a/')).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }) as Error,
    );
  });
});
