import { describe, expect, it } from 'vitest';
import { scopeParam } from './scope';

const url = (query: string) => new URL(`http://ui/api/speech${query}`);

describe('scopeParam', () => {
  it('reads a session id or none', () => {
    expect(scopeParam(url('?session=7'))).toBe(7);
    expect(scopeParam(url('?session=none'), true)).toBe('none');
  });

  it('is null without the parameter, unless it is required', () => {
    expect(scopeParam(url(''))).toBeNull();
    expect(() => scopeParam(url(''), true)).toThrow(expect.objectContaining({ status: 400 }));
  });

  it('answers 400 for anything else', () => {
    for (const value of ['0', '007', 'abc', '']) {
      expect(() => scopeParam(url(`?session=${value}`)), value).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    }
  });
});
