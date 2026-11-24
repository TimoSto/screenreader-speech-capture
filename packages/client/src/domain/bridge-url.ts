import type { Setting } from './config-value.js';
import { ClientConfigError } from './errors.js';

/** Bridge URL used when nothing else is configured. */
export const DEFAULT_BRIDGE_URL = 'http://localhost:5151';

/** Environment variable with the bridge URL. */
export const URL_ENV = 'SR_SPEECH_URL';

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

/** The bridge URL as a client setting (docs/usage/client.md#bridge-url). */
export const URL_SETTING: Setting = {
  env: URL_ENV,
  default: DEFAULT_BRIDGE_URL,
  normalize: normalizeBridgeUrl,
};
