import type { Config } from '../../../domain/config.js';

export type ConfigChangeListener = (next: Config, previous: Config) => void | Promise<void>;

export interface ManageConfig {
  get(): Config;
  /** Validates, saves and applies a partial configuration. Returns the new configuration. */
  update(patch: unknown): Promise<Config>;
  /** Called after each successful update, for example to restart a listener. */
  onChange(listener: ConfigChangeListener): void;
}
