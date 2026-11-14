import type { Config, ConfigField } from '../../../domain/config/index.js';

/** Applies a configuration change to one part of the running bridge. */
export type ConfigChangeListener = (next: Config, previous: Config) => void | Promise<void>;

export interface ReadConfig {
  /** The configuration in use. Restart-only settings keep their values from the start. */
  get(): Config;
  /**
   * Restart-only settings saved with a value that differs from the one in use: they take effect
   * on the next start.
   */
  restartRequired(): ConfigField[];
}

export interface ConfigUpdate {
  config: Config;
  restartRequired: ConfigField[];
}

export interface ManageConfig extends ReadConfig {
  /**
   * Validates and saves a partial configuration, then applies what can change while running,
   * one update at a time. Rejects with `INVALID_REQUEST` naming the field, or with the error of
   * the config file; then nothing changed. Once saved, the update is in use: a change listener
   * that fails is logged, and the others still run.
   */
  update(patch: unknown): Promise<ConfigUpdate>;
  /** Called on each update that changes the configuration in use, in the order of registration. */
  onChange(listener: ConfigChangeListener): void;
}
