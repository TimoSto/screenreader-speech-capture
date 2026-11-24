import { URL_SETTING, normalizeBridgeUrl } from './bridge-url.js';
import type { Setting } from './config-value.js';
import { ClientConfigError } from './errors.js';
import { OUTPUT_SETTING, parseOutputFormat, type OutputFormat } from './output-format.js';

/** Settings stored in the client's config file. */
export interface ClientConfig {
  url?: string;
  /** The CLI's output without `--json`. */
  output?: OutputFormat;
}

/** A change to the stored config: a value sets the key, `undefined` removes it, others stay. */
export type ClientConfigPatch = { [K in keyof ClientConfig]?: ClientConfig[K] | undefined };

/** Checks the parsed content of a config file. `origin` names the file in errors. */
export function parseClientConfig(raw: unknown, origin: string): ClientConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ClientConfigError(`The client config file ${origin} must contain a JSON object`);
  }
  const { url, output } = raw as Record<string, unknown>;
  const config: ClientConfig = {};
  if (url !== undefined) {
    if (typeof url !== 'string') {
      throw new ClientConfigError(`"url" in the client config file ${origin} must be a string`);
    }
    config.url = normalizeBridgeUrl(url, `"url" in ${origin}`);
  }
  if (output !== undefined) {
    if (typeof output !== 'string') {
      throw new ClientConfigError(`"output" in the client config file ${origin} must be a string`);
    }
    config.output = parseOutputFormat(output, `"output" in ${origin}`);
  }
  return config;
}

/** Keys the client config stores: each one's env variable, default and check. */
export const CONFIG_KEYS = {
  url: URL_SETTING,
  output: OUTPUT_SETTING,
} as const satisfies Record<keyof ClientConfig, Setting>;

export type ConfigKey = keyof typeof CONFIG_KEYS;

/** Checks a key name given by a user. */
export function parseConfigKey(key: string): ConfigKey {
  if (Object.hasOwn(CONFIG_KEYS, key)) return key as ConfigKey;
  throw new ClientConfigError(
    `Unknown config key "${key}". Known keys: ${Object.keys(CONFIG_KEYS).join(', ')}.`,
  );
}
