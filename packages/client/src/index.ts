export {
  ClientConfigError,
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  readClientConfig,
  resolveBridgeUrl,
  URL_ENV,
  writeClientConfig,
  type ClientConfig,
  type Resolved,
  type ResolveOptions,
  type ValueSource,
} from './config/client-config.js';
export { CONFIG_PATH_ENV, clientConfigFile } from './config/paths.js';
