/* eslint-disable @typescript-eslint/unbound-method -- `vi.fn` spies on the fake API are asserted on directly */
import { describe, expect, it, vi } from 'vitest';
import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';
import { SettingRejected, type ConfigApi, type ConfigState } from '#lib/core/config.js';
import { createConfigStore } from './config.svelte.js';

const config: ConfigDto = {
  tcp: { host: '127.0.0.1', port: 4449, encoding: 'windows-1252', maxLineBytes: 65536 },
  http: { host: '127.0.0.1', port: 5151, allowedHosts: [] },
  playwright: { enabled: true, port: 3000, version: null },
  mcp: { enabled: true, port: 8931 },
  buffer: { maxEntries: 10000 },
  log: { level: 'info', file: null, consoleSpeech: false },
};

function fakeApi(overrides: Record<string, string> = {}) {
  const state: ConfigState = { active: config, saved: config, overrides };
  const api: ConfigApi = {
    fetch: vi.fn(() => Promise.resolve({ ...state })),
    update: vi.fn((patch: ConfigPatchDto) => {
      if (patch.tcp?.port === 80) {
        return Promise.reject(new SettingRejected('tcp.port: in use', 'tcp.port'));
      }
      state.saved = { ...state.saved, tcp: { ...state.saved.tcp, ...patch.tcp } };
      return Promise.resolve(state.saved);
    }),
  };
  return api;
}

describe('createConfigStore', () => {
  it('has nothing before the first read', () => {
    const store = createConfigStore(fakeApi());
    expect(store.loaded).toBe(false);
    expect(store.active).toBeNull();
    expect(store.pending).toEqual([]);
  });

  it('shows the seeded configuration without a request, and the newest seed wins', () => {
    const api = fakeApi();
    const store = createConfigStore(api);
    store.seed({ active: config, saved: config, overrides: {} });
    expect(store.active?.tcp.port).toBe(4449);
    const saved = { ...config, tcp: { ...config.tcp, port: 4450 } };
    store.seed({ active: config, saved, overrides: {} });
    store.seed(null);
    expect(store.pending).toEqual(['tcp.port']);
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('reads the active and the saved configuration and the overrides', async () => {
    const store = createConfigStore(fakeApi({ 'tcp.port': '--tcp-port' }));
    await store.refresh();
    expect(store.loaded).toBe(true);
    expect(store.active?.tcp.port).toBe(4449);
    expect(store.overrides).toEqual({ 'tcp.port': '--tcp-port' });
    expect(store.pending).toEqual([]);
  });

  it('shows a saved setting as pending until the bridge restarts', async () => {
    const api = fakeApi();
    const store = createConfigStore(api);
    await store.refresh();
    await store.save({ tcp: { port: 4450 } });
    expect(api.update).toHaveBeenCalledWith({ tcp: { port: 4450 } });
    expect(store.active?.tcp.port).toBe(4449);
    expect(store.saved?.tcp.port).toBe(4450);
    expect(store.pending).toEqual(['tcp.port']);
  });

  it('rejects with the bridge message and keeps what it knew', async () => {
    const store = createConfigStore(fakeApi());
    await store.refresh();
    await expect(store.save({ tcp: { port: 80 } })).rejects.toMatchObject({
      message: 'tcp.port: in use',
      field: 'tcp.port',
    });
    expect(store.saved?.tcp.port).toBe(4449);
  });

  it('keeps the last configuration and says so when the bridge is unreachable', async () => {
    const api = fakeApi();
    const store = createConfigStore(api);
    await store.refresh();
    vi.mocked(api.fetch).mockRejectedValueOnce(new Error('down'));
    await store.refresh();
    expect(store.reachable).toBe(false);
    expect(store.active?.tcp.port).toBe(4449);
    await store.refresh();
    expect(store.reachable).toBe(true);
  });
});
