// Public API of screenreader-speech-capture-client.
export {
  clientConfigFile,
  CONFIG_PATH_ENV,
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
  StartSessionOptions,
  WaitOptions,
} from './application/ports/in/speech-capture.js';
export {
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  URL_ENV,
  type ValueSource,
} from './domain/bridge-url.js';
export type { ClientConfig, ConfigKey } from './domain/client-config.js';
export {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  ClientConfigError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from './domain/errors.js';
export type { BridgeState, BridgeStatus, ServiceStatus } from './domain/bridge-status.js';
export type { SpeechFeedEvent } from './domain/feed-event.js';
export type { Session, SessionList, SessionRef, StartedSession } from './domain/session.js';
export type { SpeechEntry } from './domain/speech-entry.js';
export { normalizeText } from '@screenreader-speech-capture/shared';
export type { SpeechMatch } from './domain/text-match.js';
