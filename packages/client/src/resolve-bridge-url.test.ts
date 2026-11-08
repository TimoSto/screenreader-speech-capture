import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ClientConfig } from './core/bridge-url.js';
import type { ClientConfigStore } from './ports/config-store.js';
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
    expect(await resolveBridgeUrl({ explicit: 'http://x:1', env: {}, store: unreadable })).toEqual({
      value: 'http://x:1',
      source: 'explicit',
    });
    expect(
      await resolveBridgeUrl({ env: { SR_SPEECH_URL: 'http://env:1' }, store: unreadable }),
    ).toEqual({ value: 'http://env:1', source: 'env' });
  });

  it('uses the stored url, then the default', async () => {
    expect(await resolveBridgeUrl({ env: {}, store: storeWith({ url: 'http://s:1' }) })).toEqual({
      value: 'http://s:1',
      source: 'config',
    });
    expect((await resolveBridgeUrl({ env: {}, store: storeWith({}) })).source).toBe('default');
  });

  it('finds the default store through SR_SPEECH_CLIENT_CONFIG', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sr-client-resolve-'));
    try {
      const file = path.join(dir, 'client.json');
      await fs.writeFile(file, '{"url":"http://from-file:1"}');
      expect(await resolveBridgeUrl({ env: { SR_SPEECH_CLIENT_CONFIG: file } })).toEqual({
        value: 'http://from-file:1',
        source: 'config',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
