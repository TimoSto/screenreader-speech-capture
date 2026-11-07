import {
  changedFields,
  configFields,
  mergeConfig,
  mergePatch,
  validatePatch,
  type Config,
  type ConfigField,
  type ConfigPatch,
} from '../../domain/config.js';
import type { ConfigChangeListener, ManageConfig } from '../ports/in/manage-config.js';
import type { ConfigStore } from '../ports/out/config-store.js';
import type { Logger } from '../ports/out/logger.js';

export interface ConfigServiceDeps {
  store: ConfigStore;
  logger: Logger;
  /** The configuration in use: defaults, config file, environment and flags. */
  active: Config;
  /** The config file's own settings. */
  file: ConfigPatch;
  /**
   * Settings a flag or an environment variable sets at startup, with what sets them (for
   * example `--tcp-port`). They win over the file again on the next start.
   */
  pinned?: ReadonlyMap<ConfigField, string>;
}

const show = (value: unknown) => JSON.stringify(value);

/**
 * The configuration (`GET` / `PUT /api/v1/config`). An update applies to the running bridge
 * through the change listeners and is saved to the config file (docs/configuration.md).
 */
export class ConfigService implements ManageConfig {
  private active: Config;
  private file: ConfigPatch;
  private readonly listeners: ConfigChangeListener[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ConfigServiceDeps) {
    this.active = deps.active;
    this.file = deps.file;
  }

  get(): Config {
    return this.active;
  }

  onChange(listener: ConfigChangeListener): void {
    this.listeners.push(listener);
  }

  update(patch: unknown): Promise<Config> {
    // One at a time: a second update starts from the result of the first.
    const result = this.queue.then(() => this.apply(patch));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(patch: unknown): Promise<Config> {
    const changes = validatePatch(patch);
    const previous = this.active;
    const next = mergeConfig(previous, changes);
    const changed = changedFields(previous, next);
    const saved = configFields(this.file);
    const fileChanged = [...configFields(changes)].some(
      ([field, value]) => saved.get(field) !== value,
    );
    if (changed.length === 0 && !fileChanged) return previous;

    const applied: ConfigChangeListener[] = [];
    try {
      if (changed.length > 0) {
        for (const listener of this.listeners) {
          await listener(next, previous);
          applied.push(listener);
        }
      }
      const file = mergePatch(this.file, changes);
      if (fileChanged) await this.deps.store.save(file);
      this.file = file;
    } catch (error) {
      await this.undo(applied, previous, next);
      throw error;
    }

    this.active = next;
    this.log(changes, changed);
    return next;
  }

  private async undo(applied: ConfigChangeListener[], previous: Config, next: Config) {
    for (const listener of applied.reverse()) {
      try {
        await listener(previous, next);
      } catch (error) {
        this.deps.logger.error(`could not undo a configuration change: ${String(error)}`);
      }
    }
  }

  private log(changes: ConfigPatch, changed: ReturnType<typeof changedFields>) {
    const { logger, pinned, store } = this.deps;
    for (const { field, from, to } of changed) logger.info(`${field}: ${show(from)} → ${show(to)}`);
    for (const field of configFields(changes).keys()) {
      const source = pinned?.get(field);
      if (source !== undefined) {
        logger.warn(
          `${field}: saved to ${store.location}, but ${source} overrides it on the next start`,
        );
      }
    }
  }
}
