import type { Config } from '../../../domain/config.js';

/** The config file. */
export interface ConfigStore {
  /** Location of the config file, for log messages. */
  readonly location: string;
  /** The saved (partial) configuration, or `undefined` if there is no file yet. */
  load(): Promise<unknown>;
  save(config: Config): Promise<void>;
}
