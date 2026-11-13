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

  it('registers paths relative to its prefix', () => {
    const handler = () => {};
    const router = new Router('/api').add('GET', '/a', handler);
    expect(router.find('GET', '/api/a')).toBe(handler);
    expect(() => router.find('GET', '/a')).toThrow('Unknown endpoint GET /a');
  });
});
