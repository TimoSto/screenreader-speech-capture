// Public API of screenreader-speech-capture-client.
export {
  createClientConfig,
  SpeechCaptureClient,
  type SpeechCaptureClientOptions,
} from './main.js';
export type {
  ConfigValue,
  ExplicitValues,
  ManageClientConfig,
  SetResult,
} from './application/ports/in/manage-client-config.js';
export type {
  GetSpeechOptions,
  GetTextOptions,
  OnSpeechOptions,
  ReadyOptions,
  Recording,
  SilenceOptions,
  SpeechCapture,
  WaitOptions,
} from './application/ports/in/speech-capture.js';
export {
  ClientConfigError,
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  URL_ENV,
  type ClientConfig,
  type ConfigKey,
  type ValueSource,
} from './domain/bridge-url.js';
export {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from './domain/errors.js';
export type {
  BridgeState,
  BridgeStatus,
  ServiceStatus,
  SpeechEntry,
  SpeechFeedEvent,
} from './domain/speech-entry.js';
export { normalizeText, type SpeechMatch } from './domain/text-match.js';
export { CONFIG_PATH_ENV, clientConfigFile } from './adapters/out/fs-config/paths.js';
