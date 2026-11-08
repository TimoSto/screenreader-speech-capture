// Public API of screenreader-speech-capture-client.
export { createClientConfig } from './main.js';
export type {
  ConfigValue,
  ExplicitValues,
  ManageClientConfig,
  SetResult,
} from './application/ports/in/manage-client-config.js';
export {
  ClientConfigError,
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  URL_ENV,
  type ClientConfig,
  type ConfigKey,
  type ValueSource,
} from './domain/bridge-url.js';
export { CONFIG_PATH_ENV, clientConfigFile } from './adapters/out/fs-config/paths.js';
