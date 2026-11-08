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
export {
  defaultClientConfigStore,
  resolveBridgeUrl,
  type ResolveOptions,
} from './resolve-bridge-url.js';
