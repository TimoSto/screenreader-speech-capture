import { describe, expect, it } from 'vitest';
import { MemoryConfigStore, MemoryLogger } from '../../../test/fakes.js';
import {
  DEFAULT_CONFIG,
  mergeConfig,
  type Config,
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
  it('applies a patch, saves only the file settings plus the patch, and logs the change', async () => {
    const { config, store, logger } = setup({
      file: { log: { level: 'debug' } },
      overrides: { tcp: { host: '0.0.0.0' } },
    });
    const seen: [number, number][] = [];
    config.onChange((next, previous) => void seen.push([previous.tcp.port, next.tcp.port]));

    const next = await config.update({ tcp: { port: 4450 } });

    expect(next.tcp).toMatchObject({ port: 4450, host: '0.0.0.0' });
    expect(config.get()).toBe(next);
    expect(seen).toEqual([[4449, 4450]]);
    expect(store.saved).toEqual({ log: { level: 'debug' }, tcp: { port: 4450 } });
    expect(logger.lines).toEqual(['info tcp.port: 4449 → 4450']);
  });

  it('rejects an invalid patch with the field and changes nothing', async () => {
    const { config, store } = setup();
    let called = false;
    config.onChange(() => void (called = true));
    await expect(config.update({ buffer: { maxEntries: 0 } })).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
      details: { field: 'buffer.maxEntries' },
    });
    expect(called).toBe(false);
    expect(store.saved).toBeUndefined();
    expect(config.get()).toEqual(DEFAULT_CONFIG);
  });

  it('does nothing for a patch that changes nothing', async () => {
    const { config, store } = setup({ file: { tcp: { port: 4449 } } });
    let called = false;
    config.onChange(() => void (called = true));
    expect(await config.update({ tcp: { port: 4449 } })).toBe(config.get());
    expect(called).toBe(false);
    expect(store.saved).toBeUndefined();
  });

  it('undoes the listeners that already applied when a later one fails', async () => {
    const { config, store } = setup();
    const calls: string[] = [];
    config.onChange((next, previous) => void calls.push(`a ${previous.tcp.port}→${next.tcp.port}`));
    config.onChange(() => {
      throw new AppError('INVALID_REQUEST', 'tcp.port: in use', { field: 'tcp.port' });
    });

    await expect(config.update({ tcp: { port: 4450 } })).rejects.toMatchObject({
      details: { field: 'tcp.port' },
    });
    expect(calls).toEqual(['a 4449→4450', 'a 4450→4449']);
    expect(config.get().tcp.port).toBe(4449);
    expect(store.saved).toBeUndefined();
  });

  it('undoes the change when the config file cannot be saved', async () => {
    const { config, store, logger } = setup();
    const ports: number[] = [];
    config.onChange((next) => void ports.push(next.tcp.port));
    store.failSave = true;

    await expect(config.update({ tcp: { port: 4450 } })).rejects.toThrow('disk full');
    expect(ports).toEqual([4450, 4449]);
    expect(config.get().tcp.port).toBe(4449);
    expect(logger.lines).toEqual([]);
  });

  it('runs one update at a time, each starting from the one before', async () => {
    const { config } = setup();
    const order: string[] = [];
    config.onChange(async (next, previous) => {
      order.push(`start ${previous.tcp.port}→${next.tcp.port}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end ${next.tcp.port}`);
    });

    const results = await Promise.all([
      config.update({ tcp: { port: 1 } }),
      config.update({ buffer: { maxEntries: 5 } }),
      config.update({ tcp: { port: 2 } }),
    ]);

    expect(order).toEqual(['start 4449→1', 'end 1', 'start 1→1', 'end 1', 'start 1→2', 'end 2']);
    expect(results.map((c: Config) => [c.tcp.port, c.buffer.maxEntries])).toEqual([
      [1, 10000],
      [1, 5],
      [2, 5],
    ]);
  });

  it('keeps working after a failed update', async () => {
    const { config } = setup();
    await expect(config.update({ nope: {} })).rejects.toThrow(AppError);
    expect((await config.update({ tcp: { port: 1 } })).tcp.port).toBe(1);
  });

  it('warns when a flag or env var overrides the saved setting on the next start', async () => {
    const { config, store, logger } = setup({
      overrides: { tcp: { port: 5000 } },
      pinned: ['tcp.port'],
    });
    const next = await config.update({ tcp: { port: 4450 } });
    expect(next.tcp.port).toBe(4450);
    expect(store.saved).toEqual({ tcp: { port: 4450 } });
    expect(logger.lines).toEqual([
      'info tcp.port: 5000 → 4450',
      'warn tcp.port: saved to memory:config.json, but --tcp.port overrides it on the next start',
    ]);
  });

  it('saves a pinned setting even when the running value stays the same', async () => {
    const { config, store } = setup({
      file: { tcp: { port: 4449 } },
      overrides: { tcp: { port: 4450 } },
      pinned: ['tcp.port'],
    });
    let called = false;
    config.onChange(() => void (called = true));
    await config.update({ tcp: { port: 4450 } });
    expect(called).toBe(false);
    expect(store.saved).toEqual({ tcp: { port: 4450 } });
  });
});
