import type { Config } from '../../../domain/config/index.js';

export interface ReadConfig {
  /** The configuration in use. It doesn't change while the bridge runs. */
  get(): Config;
}

export interface ManageConfig extends ReadConfig {
  /**
   * The configuration the next start will use: the one in use with every update since the start
   * on top (flags and environment variables not applied, see `overrides`).
   */
  getSaved(): Config;
  /**
   * The settings a flag or an environment variable sets, by dotted path (`tcp.port`), with what
   * sets each (`--tcp-port`). They win over the config file on every start.
   */
  overrides(): Readonly<Record<string, string>>;
  /**
   * Validates and saves a partial configuration, one update at a time. It takes effect on the
   * next start. Resolves with the configuration that will be in use then, unless a flag or an
   * environment variable overrides a setting. Rejects with `INVALID_REQUEST` naming the field,
   * or with the error of the config file; then nothing changed.
   */
  update(patch: unknown): Promise<Config>;
}
