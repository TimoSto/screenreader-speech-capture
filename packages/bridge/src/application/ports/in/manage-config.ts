import type { Config } from '../../../domain/config/index.js';

/**
 * Applies a configuration change to one part of the bridge, for example by restarting a
 * listener. If it throws, it must leave its part as it was; the change is then undone in the
 * parts that already took it.
 */
export type ConfigChangeListener = (next: Config, previous: Config) => void | Promise<void>;

export interface ReadConfig {
  get(): Config;
}

export interface ManageConfig extends ReadConfig {
  /**
   * Validates, applies and saves a partial configuration, one update at a time. Returns the new
   * configuration. Rejects with `INVALID_REQUEST` naming the field, or with the error of the
   * listener or the config file that failed, after undoing the change.
   */
  update(patch: unknown): Promise<Config>;
  /** Called on each update that changes the configuration, in the order of registration. */
  onChange(listener: ConfigChangeListener): void;
}
