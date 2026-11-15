import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../test/fakes.js';
import { bridgeApiUrl, createUiMount } from './ui.js';

describe('createUiMount', () => {
  it('is undefined without a build of the UI', () => {
    const logger = new MemoryLogger();
    expect(createUiMount(new URL('./no-such-ui/', import.meta.url), logger)).toBeUndefined();
  });
});

describe('bridgeApiUrl', () => {
  it.each([
    ['0.0.0.0', 5151, 'http://127.0.0.1:5151'],
    ['', 5151, 'http://127.0.0.1:5151'],
    ['::', 5151, 'http://[::1]:5151'],
    ['127.0.0.1', 1234, 'http://127.0.0.1:1234'],
    ['192.168.1.5', 80, 'http://192.168.1.5:80'],
    ['fe80::1', 80, 'http://[fe80::1]:80'],
  ])('%j → %s', (host, port, url) => {
    expect(bridgeApiUrl(host, port)).toBe(url);
  });
});
