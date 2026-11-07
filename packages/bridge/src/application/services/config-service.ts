import type { Config } from '../../domain/config.js';
import type { ReadConfig } from '../ports/in/manage-config.js';

/** The active configuration. Read-only for now; updates come with `PUT /api/v1/config`. */
export class ConfigService implements ReadConfig {
  constructor(private readonly config: Config) {}

  get(): Config {
    return this.config;
  }
}
