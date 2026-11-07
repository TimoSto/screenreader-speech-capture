import { describe, expect, it } from 'vitest';
import { Router } from './router.js';

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
