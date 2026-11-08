// Public API and composition root: the only place that knows the concrete adapters
// (docs/architecture.md#client-hexagonal-lite).
import { FsClientConfigStore } from './adapters/out/fs-config/fs-client-config-store.js';
import { clientConfigFile } from './adapters/out/fs-config/paths.js';
import { resolveBridgeUrl as resolveWith } from './application/resolve-bridge-url.js';
import { URL_ENV, type Resolved } from './core/bridge-url.js';
import type { ClientConfigStore } from './ports/config-store.js';

export {
  ClientConfigError,
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  URL_ENV,
  type ClientConfig,
  type ClientConfigPatch,
  type Resolved,
  type ValueSource,
} from './core/bridge-url.js';
export type { ClientConfigStore } from './ports/config-store.js';
export { CONFIG_PATH_ENV, clientConfigFile } from './adapters/out/fs-config/paths.js';

/** The per-user config file store (docs/client.md#bridge-url). */
export function defaultClientConfigStore(env: NodeJS.ProcessEnv = process.env): ClientConfigStore {
  return new FsClientConfigStore(clientConfigFile(undefined, env));
}

export interface ResolveOptions {
  /** Passed in code (`baseUrl`, fixture option) or on the command line (`--url`). */
  explicit?: string | undefined;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to {@link defaultClientConfigStore}. */
  store?: ClientConfigStore;
}

/**
 * The bridge URL to use: explicit value, then `SR_SPEECH_URL`, then the config file, then
 * `http://localhost:5151`. The config file is only read when nothing above it is set.
 */
export function resolveBridgeUrl(options: ResolveOptions = {}): Promise<Resolved> {
  const env = options.env ?? process.env;
  return resolveWith({
    explicit: options.explicit,
    envUrl: env[URL_ENV],
    store: options.store ?? defaultClientConfigStore(env),
  });
}
