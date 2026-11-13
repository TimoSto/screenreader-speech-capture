import { describe, expect, it } from 'vitest';
import type { ClientConfig } from '../../domain/client-config.js';
import { ClientConfigError } from '../../domain/errors.js';
import type { ClientConfigStore } from '../ports/out/client-config-store.js';
import { ClientConfigService } from './client-config-service.js';

class MemoryStore implements ClientConfigStore {
  readonly location = 'memory';
  reads = 0;
  constructor(public data: ClientConfig = {}) {}
  load(): Promise<ClientConfig> {
    this.reads += 1;
    return Promise.resolve({ ...this.data });
  }
  save(patch: { url: string | undefined }): Promise<void> {
    if (patch.url === undefined) delete this.data.url;
    else this.data.url = patch.url;
    return Promise.resolve();
  }
}

describe('ClientConfigService', () => {
  describe('get', () => {
    it('prefers the explicit value, then SR_SPEECH_URL, without reading the store', async () => {
      const store = new MemoryStore({ url: 'http://stored:1' });
      const service = new ClientConfigService({ store, envUrl: 'http://env:1' });
      expect(await service.get('url', { url: 'http://explicit:1/' })).toEqual({
        key: 'url',
        value: 'http://explicit:1',
        source: 'explicit',
      });
      expect(await service.get('url')).toEqual({
        key: 'url',
        value: 'http://env:1',
        source: 'env',
      });
      expect(store.reads).toBe(0);
    });

    it('then the stored value, then the default', async () => {
      const store = new MemoryStore({ url: 'http://stored:1' });
      const service = new ClientConfigService({ store });
      expect((await service.get('url')).source).toBe('config');
      store.data = {};
      expect(await service.get('url')).toEqual({
        key: 'url',
        value: 'http://localhost:5151',
        source: 'default',
      });
    });

    it('passes store errors on', async () => {
      const store = new MemoryStore();
      store.load = () => Promise.reject(new ClientConfigError('broken'));
      await expect(new ClientConfigService({ store }).get('url')).rejects.toThrow('broken');
    });
  });

  it('set normalises, saves and reports when SR_SPEECH_URL hides the value', async () => {
    const store = new MemoryStore();
    expect(await new ClientConfigService({ store }).set('url', 'http://vm:1/')).toEqual({
      key: 'url',
      value: 'http://vm:1',
    });
    expect(store.data).toEqual({ url: 'http://vm:1' });
    expect(
      await new ClientConfigService({ store, envUrl: 'http://env:1' }).set('url', 'http://vm:2'),
    ).toMatchObject({ shadowedBy: 'env' });
  });

  it('set rejects an invalid value without saving', async () => {
    const store = new MemoryStore({ url: 'http://vm:1' });
    await expect(new ClientConfigService({ store }).set('url', 'vm:1')).rejects.toThrow(
      ClientConfigError,
    );
    expect(store.data).toEqual({ url: 'http://vm:1' });
  });

  it('unset removes the value', async () => {
    const store = new MemoryStore({ url: 'http://vm:1' });
    expect(await new ClientConfigService({ store }).unset('url')).toEqual({ key: 'url' });
    expect(store.data).toEqual({});
  });

  it('list returns every key', async () => {
    const service = new ClientConfigService({ store: new MemoryStore() });
    expect(await service.list({ url: 'http://x:1' })).toEqual([
      { key: 'url', value: 'http://x:1', source: 'explicit' },
    ]);
  });

  it.each(['get', 'set', 'unset'] as const)('%s rejects an unknown key', async (method) => {
    const service = new ClientConfigService({ store: new MemoryStore() });
    await expect(service[method]('colour', 'red')).rejects.toThrow(/Unknown config key "colour"/);
  });

  it('location is the store location', () => {
    expect(new ClientConfigService({ store: new MemoryStore() }).location).toBe('memory');
  });
});
