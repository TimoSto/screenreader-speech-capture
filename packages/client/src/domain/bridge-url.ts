import { ClientConfigError } from './errors.js';

/** Bridge URL used when nothing else is configured. */
export const DEFAULT_BRIDGE_URL = 'http://localhost:5151';

/** Environment variable with the bridge URL. */
export const URL_ENV = 'SR_SPEECH_URL';

/** Where the effective value came from, highest precedence first. */
export type ValueSource = 'explicit' | 'env' | 'config' | 'default';

export interface Resolved {
  value: string;
  source: ValueSource;
}

/**
 * Checks a bridge URL and returns it normalised: only `http:` / `https:`, no trailing slash, so
 * API paths can be appended directly.
 */
export function normalizeBridgeUrl(input: string, origin = 'URL'): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new ClientConfigError(`${origin} "${input}" is not a valid URL (e.g. http://my-vm:5151)`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ClientConfigError(`${origin} "${input}" must start with http:// or https://`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new ClientConfigError(`${origin} "${input}" must not contain a query or fragment`);
  }
  return url.href.replace(/\/+$/, '');
}

export interface UrlSources {
  /** Passed in code (`baseUrl`, fixture option) or on the command line (`--url`). */
  explicit?: string | undefined;
  /** Value of `SR_SPEECH_URL`. */
  env?: string | undefined;
  /** `url` from the config file (already checked). */
  stored?: string | undefined;
}

const isSet = (value: string | undefined): value is string => value !== undefined && value !== '';

/** True if the stored value can't win, so the config file doesn't have to be read. */
export const overridesStored = (sources: UrlSources): boolean =>
  isSet(sources.explicit) || isSet(sources.env);

/**
 * The bridge URL to use: explicit value, then `SR_SPEECH_URL`, then the config file, then
 * {@link DEFAULT_BRIDGE_URL}.
 */
export function pickBridgeUrl(sources: UrlSources): Resolved {
  if (isSet(sources.explicit)) {
    return { value: normalizeBridgeUrl(sources.explicit), source: 'explicit' };
  }
  if (isSet(sources.env)) return { value: normalizeBridgeUrl(sources.env, URL_ENV), source: 'env' };
  if (isSet(sources.stored)) return { value: sources.stored, source: 'config' };
  return { value: DEFAULT_BRIDGE_URL, source: 'default' };
}
