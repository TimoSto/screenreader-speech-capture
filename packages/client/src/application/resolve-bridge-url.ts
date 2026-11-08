import { overridesStored, pickBridgeUrl, type Resolved } from '../core/bridge-url.js';
import type { ClientConfigStore } from '../ports/config-store.js';

export interface ResolveBridgeUrlInput {
  /** Passed in code (`baseUrl`, fixture option) or on the command line (`--url`). */
  explicit?: string | undefined;
  /** Value of `SR_SPEECH_URL`. */
  envUrl?: string | undefined;
  store: ClientConfigStore;
}

/**
 * The bridge URL to use: explicit value, then `SR_SPEECH_URL`, then the stored config, then the
 * default. The store is only read when nothing above it is set, so a broken config file doesn't
 * matter while `--url` or `SR_SPEECH_URL` is given.
 */
export async function resolveBridgeUrl(input: ResolveBridgeUrlInput): Promise<Resolved> {
  const sources = { explicit: input.explicit, env: input.envUrl };
  if (overridesStored(sources)) return pickBridgeUrl(sources);
  return pickBridgeUrl({ ...sources, stored: (await input.store.load()).url });
}
