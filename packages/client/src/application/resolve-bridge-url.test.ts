import { describe, expect, it } from 'vitest';
import type { ClientConfig } from '../core/bridge-url.js';
import type { ClientConfigStore } from '../ports/config-store.js';
import { resolveBridgeUrl } from './resolve-bridge-url.js';

const storeWith = (config: ClientConfig): ClientConfigStore => ({
  location: 'memory',
  load: () => Promise.resolve(config),
  save: () => Promise.reject(new Error('not used')),
});

const unreadable: ClientConfigStore = {
  location: 'memory',
  load: () => Promise.reject(new Error('must not be read')),
  save: () => Promise.reject(new Error('not used')),
};

describe('resolveBridgeUrl', () => {
  it('does not read the store when --url or SR_SPEECH_URL is set', async () => {
    expect(await resolveBridgeUrl({ explicit: 'http://x:1', store: unreadable })).toEqual({
      value: 'http://x:1',
      source: 'explicit',
    });
    expect(await resolveBridgeUrl({ envUrl: 'http://env:1', store: unreadable })).toEqual({
      value: 'http://env:1',
      source: 'env',
    });
  });

  it('uses the stored url, then the default', async () => {
    expect(await resolveBridgeUrl({ store: storeWith({ url: 'http://s:1' }) })).toEqual({
      value: 'http://s:1',
      source: 'config',
    });
    expect((await resolveBridgeUrl({ store: storeWith({}) })).source).toBe('default');
  });

  it('passes store errors on', async () => {
    await expect(resolveBridgeUrl({ store: unreadable })).rejects.toThrow('must not be read');
  });
});
