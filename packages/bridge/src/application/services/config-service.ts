import {
  assertDistinctPorts,
  configFields,
  mergeConfig,
  mergePatch,
  validatePatch,
  type Config,
  type ConfigField,
  type ConfigPatch,
} from '../../domain/config/index.js';
import type { ManageConfig } from '../ports/in/manage-config.js';
import type { ConfigStore } from '../ports/out/config-store.js';
import type { Logger } from '../ports/out/logger.js';

interface ConfigServiceDeps {
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
 * The configuration (`GET` / `PUT /api/v1/config`). The configuration in use never changes while
 * the bridge runs: an update is saved to the config file and takes effect on the next start
 * (docs/usage/configuration.md#changing-settings).
 */
export class ConfigService implements ManageConfig {
  private readonly active: Config;
  private file: ConfigPatch;
  /** The configuration in use with every update since the start on top: what is saved. */
  private saved: Config;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ConfigServiceDeps) {
    this.active = deps.active;
    this.saved = deps.active;
    this.file = deps.file;
  }

  get(): Config {
    return this.active;
  }

  update(patch: unknown): Promise<Config> {
    // One at a time: a second update starts from the result of the first.
    const result = this.queue.then(() => this.apply(patch));
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async apply(patch: unknown): Promise<Config> {
    const changes = validatePatch(patch);
    const merged = mergeConfig(this.saved, changes);
    assertDistinctPorts(merged);

    // Saved first: if the file can't be written, nothing has changed.
    const saved = configFields(this.file);
    const patched = configFields(changes);
    if ([...patched].some(([field, value]) => !same(saved.get(field), value))) {
      const file = mergePatch(this.file, changes);
      await this.deps.store.save(file);
      this.file = file;
    }
    this.saved = merged;

    this.log(patched);
    return merged;
  }

  private log(patched: Map<ConfigField, unknown>) {
    const { logger, pinned, store } = this.deps;
    const running = configFields(this.active);
    for (const [field, value] of patched) {
      const source = pinned?.get(field);
      if (source !== undefined) {
        logger.warn(
          `${field}: saved to ${store.location}, but ${source} overrides it on the next start`,
        );
      } else if (!same(value, running.get(field))) {
        logger.info(`${field}: ${show(running.get(field))} → ${show(value)} on the next start`);
      }
    }
  }
}
