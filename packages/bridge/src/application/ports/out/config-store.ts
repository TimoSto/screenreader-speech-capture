import type { ConfigPatch } from '../../../domain/config.js';

/** The config file. */
export interface ConfigStore {
  /** Location of the config file, for log messages. */
  readonly location: string;
  /** The saved (partial) configuration, or `undefined` if there is no file yet. */
  load(): Promise<unknown>;
  /** Saves the file's own settings (never values from flags or environment variables). */
  save(file: ConfigPatch): Promise<void>;
}
