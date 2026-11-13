import { describe, expect, it } from 'vitest';
import { MemoryConfigStore } from '../../test/fakes.js';
import type { ConfigStore } from '../application/ports/out/config-store.js';
import { DEFAULT_CONFIG } from '../domain/config/index.js';
import { ConfigError, loadConfig } from './load-config.js';

const sourceOf = (field: string) => `--${field.replace('.', '-')}`;

describe('loadConfig', () => {
  it('applies defaults, then the file, then the overrides', async () => {
    const store = new MemoryConfigStore({ tcp: { port: 1 }, http: { port: 2 } });
    const { config, file, overrides } = await loadConfig(store, { http: { port: 3 } }, sourceOf);
    expect(config.tcp.port).toBe(1);
    expect(config.http.port).toBe(3);
    expect(config.buffer).toEqual(DEFAULT_CONFIG.buffer);
    expect(file).toEqual({ tcp: { port: 1 }, http: { port: 2 } });
    expect(overrides).toEqual({ http: { port: 3 } });
  });

  it('works without a config file', async () => {
    const { config } = await loadConfig(new MemoryConfigStore(), {}, sourceOf);
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  it('names the config file for an invalid setting in it', async () => {
    const store = new MemoryConfigStore({ tcp: { port: -1 } });
    const error = await loadConfig(store, {}, sourceOf).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toBe(
      'Invalid setting in the config file memory:config.json: tcp.port: must be an integer from 0 to 65535',
    );
  });

  it('names the flag for an invalid override', async () => {
    const error = await loadConfig(
      new MemoryConfigStore(),
      { http: { port: 70000 } },
      sourceOf,
    ).catch((e: unknown) => e);
    expect((error as Error).message).toMatch(/^Invalid --http-port: http\.port: /);
  });

  it('wraps a store that cannot be read', async () => {
    const store: ConfigStore = {
      location: 'x',
      load: () => Promise.reject(new Error('not JSON')),
      save: () => Promise.resolve(),
    };
    const error = await loadConfig(store, {}, sourceOf).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toBe('not JSON');
  });
});
