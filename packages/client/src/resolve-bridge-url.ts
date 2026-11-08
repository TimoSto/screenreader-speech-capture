import { FsClientConfigStore } from './adapters/out/fs-config/fs-client-config-store.js';
import { clientConfigFile } from './adapters/out/fs-config/paths.js';
import { overridesStored, pickBridgeUrl, URL_ENV, type Resolved } from './core/bridge-url.js';
import type { ClientConfigStore } from './ports/config-store.js';

/** The per-user config file store (docs/client.md#bridge-url). */
export function defaultClientConfigStore(env: NodeJS.ProcessEnv = process.env): ClientConfigStore {
  return new FsClientConfigStore(clientConfigFile(undefined, env));
}

export interface ResolveOptions {
  /** Passed in code (`baseUrl`, fixture option) or on the command line (`--url`). */
  explicit?: string | undefined;
  env?: NodeJS.ProcessEnv;
  /** Defaults to {@link defaultClientConfigStore}. */
  store?: ClientConfigStore;
}

/**
 * The bridge URL to use: explicit value, then `SR_SPEECH_URL`, then the config file, then the
 * default. The config file is only read when nothing above it is set.
 */
export async function resolveBridgeUrl(options: ResolveOptions = {}): Promise<Resolved> {
  const env = options.env ?? process.env;
  const sources = { explicit: options.explicit, env: env[URL_ENV] };
  if (overridesStored(sources)) return pickBridgeUrl(sources);
  const store = options.store ?? defaultClientConfigStore(env);
  return pickBridgeUrl({ ...sources, stored: (await store.load()).url });
}
