import {
  changedFields,
  configFields,
  liveConfig,
  mergeConfig,
  mergePatch,
  RESTART_FIELDS,
  validatePatch,
  type Config,
  type ConfigField,
  type ConfigPatch,
} from '../../domain/config/index.js';
import type {
  ConfigChangeListener,
  ConfigUpdate,
  ManageConfig,
} from '../ports/in/manage-config.js';
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
const same = (a: unknown, b: unknown) => show(a) === show(b);

/**
 * The configuration (`GET` / `PUT /api/v1/config`). An update is saved to the config file, then
 * applied to the running bridge through the change listeners, except the restart-only settings
 * (docs/usage/configuration.md#changing-settings).
 */
export class ConfigService implements ManageConfig {
  private active: Config;
  private file: ConfigPatch;
  /** Restart-only settings saved with another value than the one in use, and that value. */
  private readonly pending = new Map<ConfigField, unknown>();
  private readonly listeners: ConfigChangeListener[] = [];
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ConfigServiceDeps) {
    this.active = deps.active;
    this.file = deps.file;
  }

  get(): Config {
    return this.active;
  }

  restartRequired(): ConfigField[] {
    return [...this.pending.keys()];
  }

  onChange(listener: ConfigChangeListener): void {
    this.listeners.push(listener);
  }

  update(patch: unknown): Promise<ConfigUpdate> {
    // One at a time: a second update starts from the result of the first.
    const result = this.queue.then(() => this.apply(patch));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(patch: unknown): Promise<ConfigUpdate> {
    const changes = validatePatch(patch);
    const previous = this.active;
    const next = liveConfig(mergeConfig(previous, changes), previous);

    // Saved first: if the file can't be written, nothing has changed.
    const saved = configFields(this.file);
    const patched = configFields(changes);
    if ([...patched].some(([field, value]) => !same(saved.get(field), value))) {
      const file = mergePatch(this.file, changes);
      await this.deps.store.save(file);
      this.file = file;
    }

    // In use from here on, like the saved file: a listener that fails can't leave the bridge
    // reporting the old settings while the file and the other listeners have the new ones.
    this.active = next;
    const changed = changedFields(previous, next);
    if (changed.length > 0) {
      for (const listener of this.listeners) {
        try {
          await listener(next, previous);
        } catch (error) {
          this.deps.logger.error(`applying the change failed: ${String(error)}`);
        }
      }
    }

    const running = configFields(previous);
    const later: { field: ConfigField; to: unknown }[] = [];
    for (const [field, value] of patched) {
      // A pinned setting is replaced by its flag on the next start: `log` warns about it.
      if (!RESTART_FIELDS.has(field) || this.deps.pinned?.has(field)) continue;
      if (same(value, running.get(field))) {
        this.pending.delete(field);
      } else if (!same(value, this.pending.get(field))) {
        this.pending.set(field, value);
        later.push({ field, to: value });
      }
    }
    this.log(patched.keys(), changed, later, running);
    return { config: next, restartRequired: this.restartRequired() };
  }

  private log(
    patched: Iterable<ConfigField>,
    changed: ReturnType<typeof changedFields>,
    later: { field: ConfigField; to: unknown }[],
    running: Map<ConfigField, unknown>,
  ) {
    const { logger, pinned, store } = this.deps;
    for (const { field, from, to } of changed) logger.info(`${field}: ${show(from)} → ${show(to)}`);
    for (const { field, to } of later) {
      logger.info(`${field}: ${show(running.get(field))} → ${show(to)} on the next start`);
    }
    for (const field of patched) {
      const source = pinned?.get(field);
      if (source !== undefined) {
        logger.warn(
          `${field}: saved to ${store.location}, but ${source} overrides it on the next start`,
        );
      }
    }
  }
}
