import type { Config } from '../../../domain/config/index.js';

export interface ReadConfig {
  /** The configuration in use. It doesn't change while the bridge runs. */
  get(): Config;
}

export interface ManageConfig extends ReadConfig {
  /**
   * Validates and saves a partial configuration, one update at a time. It takes effect on the
   * next start. Resolves with the configuration that will be in use then, unless a flag or an
   * environment variable overrides a setting. Rejects with `INVALID_REQUEST` naming the field,
   * or with the error of the config file; then nothing changed.
   */
  update(patch: unknown): Promise<Config>;
}
