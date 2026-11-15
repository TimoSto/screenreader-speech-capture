import { describe, expect, it } from 'vitest';
import { MemoryConfigStore, MemoryLogger } from '../../../test/fakes.js';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type ConfigField,
  type ConfigPatch,
} from '../../domain/config/index.js';
import { AppError } from '../../domain/errors.js';
import { ConfigService } from './config-service.js';

function setup(
  options: { file?: ConfigPatch; overrides?: ConfigPatch; pinned?: ConfigField[] } = {},
) {
  const file = options.file ?? {};
  const store = new MemoryConfigStore(file);
  const logger = new MemoryLogger();
  const active = mergeConfig(mergeConfig(DEFAULT_CONFIG, file), options.overrides ?? {});
  const pinned = new Map((options.pinned ?? []).map((field) => [field, `--${field}`]));
  const config = new ConfigService({ store, logger, active, file, pinned });
  return { config, store, logger };
}

describe('ConfigService', () => {
  it('saves only the file settings plus the patch and logs that it applies on the next start', async () => {
    const { config, store, logger } = setup({
      file: { log: { level: 'debug' } },
      overrides: { buffer: { maxEntries: 50 } },
    });

    const next = await config.update({ mcp: { port: 9000 } });

    expect(next.mcp.port).toBe(9000);
    expect(next.buffer.maxEntries).toBe(50);
    expect(config.get().mcp.port).toBe(8931);
    expect(store.saved).toEqual({ log: { level: 'debug' }, mcp: { port: 9000 } });
    expect(logger.lines).toEqual(['info mcp.port: 8931 → 9000 on the next start']);
  });

  it('starts the next update from the saved settings, not the ones in use', async () => {
    const { config } = setup();
    await config.update({ tcp: { port: 4450 } });
    const next = await config.update({ http: { port: 5152 } });
    expect(next.tcp.port).toBe(4450);
    expect(next.http.port).toBe(5152);
    expect(config.get().tcp.port).toBe(4449);
  });

  it('rejects an invalid patch with the field and changes nothing', async () => {
    const { config, store } = setup();
    await expect(config.update({ buffer: { maxEntries: 0 } })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      details: { field: 'buffer.maxEntries' },
    });
    expect(store.saved).toBeUndefined();
    expect(config.get()).toEqual(DEFAULT_CONFIG);
  });

  it('does nothing for a patch that changes nothing', async () => {
    const { config, store, logger } = setup({ file: { buffer: { maxEntries: 10000 } } });
    await config.update({ buffer: { maxEntries: 10000 } });
    expect(store.saved).toBeUndefined();
    expect(logger.lines).toEqual([]);
  });

  it('changes nothing when the config file cannot be saved', async () => {
    const { config, store, logger } = setup();
    store.failSave = true;

    await expect(config.update({ buffer: { maxEntries: 5 } })).rejects.toThrow('disk full');
    store.failSave = false;
    // The failed update is not part of the next one.
    expect((await config.update({ mcp: { port: 1 } })).buffer.maxEntries).toBe(10000);
    expect(logger.lines).toEqual(['info mcp.port: 8931 → 1 on the next start']);
  });

  it('runs one update at a time, each starting from the one before', async () => {
    const { config } = setup();
    const results = await Promise.all([
      config.update({ mcp: { port: 1 } }),
      config.update({ buffer: { maxEntries: 5 } }),
      config.update({ mcp: { port: 2 } }),
    ]);
    expect(results.map((c) => [c.mcp.port, c.buffer.maxEntries])).toEqual([
      [1, 10000],
      [1, 5],
      [2, 5],
    ]);
  });

  it('keeps working after a failed update', async () => {
    const { config } = setup();
    await expect(config.update({ nope: {} })).rejects.toThrow(AppError);
    expect((await config.update({ mcp: { port: 1 } })).mcp.port).toBe(1);
  });

  it('warns when a flag or env var overrides the saved setting on the next start', async () => {
    const { config, store, logger } = setup({
      overrides: { mcp: { port: 5000 } },
      pinned: ['mcp.port'],
    });
    const next = await config.update({ mcp: { port: 4450 } });
    expect(next.mcp.port).toBe(4450);
    expect(store.saved).toEqual({ mcp: { port: 4450 } });
    expect(logger.lines).toEqual([
      'warn mcp.port: saved to memory:config.json, but --mcp.port overrides it on the next start',
    ]);
  });
});
