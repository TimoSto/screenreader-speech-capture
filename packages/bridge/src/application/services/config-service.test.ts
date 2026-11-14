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
  it('saves only the file settings plus the patch, applies it and logs the change', async () => {
    const { config, store, logger } = setup({
      file: { log: { level: 'debug' } },
      overrides: { buffer: { maxEntries: 50 } },
    });
    const seen: [number, number][] = [];
    config.onChange((next, previous) => void seen.push([previous.mcp.port, next.mcp.port]));

    const { config: next, restartRequired } = await config.update({ mcp: { port: 9000 } });

    expect(next.mcp.port).toBe(9000);
    expect(next.buffer.maxEntries).toBe(50);
    expect(config.get()).toBe(next);
    expect(restartRequired).toEqual([]);
    expect(seen).toEqual([[8931, 9000]]);
    expect(store.saved).toEqual({ log: { level: 'debug' }, mcp: { port: 9000 } });
    expect(logger.lines).toEqual(['info mcp.port: 8931 → 9000']);
  });

  it('saves a restart-only setting without applying it, and reports it', async () => {
    const { config, store, logger } = setup();
    let called = false;
    config.onChange(() => void (called = true));

    const update = await config.update({ tcp: { port: 4450 }, http: { port: 5152 } });

    expect(update.config).toBe(config.get());
    expect(update.config.tcp.port).toBe(4449);
    expect(update.config.http.port).toBe(5151);
    expect(update.restartRequired).toEqual(['tcp.port', 'http.port']);
    expect(config.restartRequired()).toEqual(['tcp.port', 'http.port']);
    expect(called).toBe(false);
    expect(store.saved).toEqual({ tcp: { port: 4450 }, http: { port: 5152 } });
    expect(logger.lines).toEqual([
      'info tcp.port: 4449 → 4450 on the next start',
      'info http.port: 5151 → 5152 on the next start',
    ]);
  });

  it('drops a restart-only setting from restartRequired once it is set back', async () => {
    const { config } = setup();
    await config.update({ tcp: { port: 4450 } });
    expect((await config.update({ tcp: { port: 4449 } })).restartRequired).toEqual([]);
  });

  it('applies the live part of a patch that also has restart-only settings', async () => {
    const { config } = setup();
    const { config: next } = await config.update({ http: { port: 1, allowedHosts: ['vm'] } });
    expect(next.http).toEqual({ host: '0.0.0.0', port: 5151, allowedHosts: ['vm'] });
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
    const { config, store } = setup({ file: { buffer: { maxEntries: 10000 } } });
    let called = false;
    config.onChange(() => void (called = true));
    const update = await config.update({ buffer: { maxEntries: 10000 } });
    expect(update.config).toBe(config.get());
    expect(called).toBe(false);
    expect(store.saved).toBeUndefined();
  });

  it('changes nothing when the config file cannot be saved', async () => {
    const { config, store, logger } = setup();
    let called = false;
    config.onChange(() => void (called = true));
    store.failSave = true;

    await expect(config.update({ buffer: { maxEntries: 5 } })).rejects.toThrow('disk full');
    expect(called).toBe(false);
    expect(config.get().buffer.maxEntries).toBe(10000);
    expect(logger.lines).toEqual([]);
  });

  it('keeps the update in use and runs the other listeners when one fails', async () => {
    const { config, store, logger } = setup();
    const seen: number[] = [];
    config.onChange(() => Promise.reject(new Error('stop failed')));
    config.onChange((next) => void seen.push(next.mcp.port));

    const result = await config.update({ mcp: { port: 1 } });

    expect(result.config.mcp.port).toBe(1);
    expect(config.get().mcp.port).toBe(1);
    expect(store.saved).toEqual({ mcp: { port: 1 } });
    expect(seen).toEqual([1]);
    expect(logger.lines).toContain('error applying the change failed: Error: stop failed');
  });

  it('shows the new settings to listeners that read them', async () => {
    const { config } = setup();
    let read: number | undefined;
    config.onChange(() => void (read = config.get().mcp.port));
    await config.update({ mcp: { port: 1 } });
    expect(read).toBe(1);
  });

  it('runs one update at a time, each starting from the one before', async () => {
    const { config } = setup();
    const order: string[] = [];
    config.onChange(async (next, previous) => {
      order.push(`start ${previous.mcp.port}→${next.mcp.port}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push(`end ${next.mcp.port}`);
    });

    const results = await Promise.all([
      config.update({ mcp: { port: 1 } }),
      config.update({ buffer: { maxEntries: 5 } }),
      config.update({ mcp: { port: 2 } }),
    ]);

    expect(order).toEqual(['start 8931→1', 'end 1', 'start 1→1', 'end 1', 'start 1→2', 'end 2']);
    expect(
      results.map(({ config: c }: { config: Config }) => [c.mcp.port, c.buffer.maxEntries]),
    ).toEqual([
      [1, 10000],
      [1, 5],
      [2, 5],
    ]);
  });

  it('keeps working after a failed update', async () => {
    const { config } = setup();
    await expect(config.update({ nope: {} })).rejects.toThrow(AppError);
    expect((await config.update({ mcp: { port: 1 } })).config.mcp.port).toBe(1);
  });

  it('warns when a flag or env var overrides the saved setting on the next start', async () => {
    const { config, store, logger } = setup({
      overrides: { mcp: { port: 5000 } },
      pinned: ['mcp.port'],
    });
    const { config: next } = await config.update({ mcp: { port: 4450 } });
    expect(next.mcp.port).toBe(4450);
    expect(store.saved).toEqual({ mcp: { port: 4450 } });
    expect(logger.lines).toEqual([
      'info mcp.port: 5000 → 4450',
      'warn mcp.port: saved to memory:config.json, but --mcp.port overrides it on the next start',
    ]);
  });

  it('does not report a pinned restart-only setting as restartRequired: the flag wins', async () => {
    const { config, store, logger } = setup({
      overrides: { tcp: { port: 5000 } },
      pinned: ['tcp.port'],
    });
    expect((await config.update({ tcp: { port: 4450 } })).restartRequired).toEqual([]);
    expect(store.saved).toEqual({ tcp: { port: 4450 } });
    expect(logger.lines).toEqual([
      'warn tcp.port: saved to memory:config.json, but --tcp.port overrides it on the next start',
    ]);
  });
});
