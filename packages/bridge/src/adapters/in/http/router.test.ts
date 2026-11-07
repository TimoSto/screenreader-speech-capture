import { describe, expect, it } from 'vitest';
import { AppError } from '../../../domain/errors.js';
import { booleanParam, intParam, Router } from './router.js';

const url = (query: string) => new URL(`http://bridge/x?${query}`);
const range = { fallback: 7, min: 0, max: 10 };

describe('intParam', () => {
  it('uses the fallback when missing or empty', () => {
    expect(intParam(url(''), 'n', range)).toBe(7);
    expect(intParam(url('n='), 'n', range)).toBe(7);
  });

  it('parses integers in range', () => {
    expect(intParam(url('n=0'), 'n', range)).toBe(0);
    expect(intParam(url('n=10'), 'n', range)).toBe(10);
  });

  it.each(['11', '-1', '1.5', 'abc'])('rejects %s, naming the field', (value) => {
    expect(() => intParam(url(`n=${value}`), 'n', range)).toThrow(
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
