import { normalizeBridgeUrl } from './bridge-url.js';
import { ClientConfigError } from './errors.js';

/** Settings stored in the client's config file. */
export interface ClientConfig {
  url?: string;
}

/** A change to the stored config: a value sets the key, `undefined` removes it. */
export type ClientConfigPatch = { [K in keyof ClientConfig]-?: ClientConfig[K] | undefined };

/** Checks the parsed content of a config file. `origin` names the file in errors. */
export function parseClientConfig(raw: unknown, origin: string): ClientConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ClientConfigError(`The client config file ${origin} must contain a JSON object`);
  }
  const { url } = raw as Record<string, unknown>;
  if (url === undefined) return {};
  if (typeof url !== 'string') {
    throw new ClientConfigError(`"url" in the client config file ${origin} must be a string`);
  }
  return { url: normalizeBridgeUrl(url, `"url" in ${origin}`) };
}

/** Keys the client config stores, each with the check that normalises a value before saving. */
export const CONFIG_KEYS = {
  url: (value: string) => normalizeBridgeUrl(value),
} as const satisfies Record<keyof ClientConfig, (value: string) => string>;

export type ConfigKey = keyof typeof CONFIG_KEYS;

/** Checks a key name given by a user. */
export function parseConfigKey(key: string): ConfigKey {
  if (Object.hasOwn(CONFIG_KEYS, key)) return key as ConfigKey;
  throw new ClientConfigError(
    `Unknown config key "${key}". Known keys: ${Object.keys(CONFIG_KEYS).join(', ')}.`,
  );
}
