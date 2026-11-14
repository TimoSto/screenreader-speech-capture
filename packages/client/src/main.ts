// Composition root: the only place that knows the concrete adapters
// (docs/implementation/architecture.md).
import { hostname } from 'node:os';
import { API_VERSION } from '@screenreader-speech-capture/shared';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { FsClientConfigStore } from './adapters/out/fs-config/fs-client-config-store.js';
import { clientConfigFile } from './adapters/out/fs-config/paths.js';
import { FetchBridgeApi } from './adapters/out/http/fetch-bridge-api.js';
import type { ManageClientConfig } from './application/ports/in/manage-client-config.js';
import type {
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
import { ClientConfigService } from './application/services/client-config-service.js';
import { SpeechCaptureService } from './application/services/speech-capture-service.js';
import { URL_ENV } from './domain/bridge-url.js';
import type { BridgeStatus } from './domain/bridge-status.js';
import type { SessionList, StartedSession } from './domain/session.js';
import type { SpeechEntry } from './domain/speech-entry.js';
import type { SpeechMatch } from './domain/text-match.js';

// The config file location is public too: tools and docs point users at it.
export { CONFIG_PATH_ENV, clientConfigFile } from './adapters/out/fs-config/paths.js';

/**
 * The client's per-user settings, stored in the config file (docs/usage/client.md#bridge-url).
 * `SR_SPEECH_URL` and `SR_SPEECH_CLIENT_CONFIG` are read from `env` once, here.
 */
export function createClientConfig(env: NodeJS.ProcessEnv = process.env): ManageClientConfig {
  return new ClientConfigService({
    store: new FsClientConfigStore(clientConfigFile(undefined, env)),
    envUrl: env[URL_ENV],
  });
}

export interface SpeechCaptureClientOptions {
  /**
   * Bridge URL, for example `http://my-test-vm:5151`. Default: `SR_SPEECH_URL`, then the client
   * config file, then `http://localhost:5151` (docs/usage/client.md#bridge-url).
   */
  baseUrl?: string | undefined;
  /** Where `SR_SPEECH_URL` and `SR_SPEECH_CLIENT_CONFIG` are read. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
  /**
   * Names this client to the bridge, which warns when one client ends or replaces another one's
   * session (two clients sharing one screen reader). Default: `<host> pid <process id>`.
   */
  clientName?: string | undefined;
}

/**
 * Talks to the bridge (docs/usage/client.md#library): `new SpeechCaptureClient()` uses the stored
 * bridge URL. The URL is resolved on the first request.
 *
 * Wraps the service instead of extending it, so the service's internals stay out of the public
 * type surface (docs/implementation/architecture.md).
 */
export class SpeechCaptureClient implements SpeechCapture {
  readonly #service: SpeechCapture;

  constructor(options: SpeechCaptureClientOptions = {}) {
    const config = createClientConfig(options.env ?? process.env);
    this.#service = new SpeechCaptureService({
      api: new FetchBridgeApi({
        baseUrl: async () => (await config.get('url', { url: options.baseUrl })).value,
        clientName: options.clientName ?? `${hostname()} pid ${process.pid}`,
      }),
      clock: new SystemClock(),
      apiVersion: API_VERSION,
    });
  }

  getSpeech(options?: GetSpeechOptions): Promise<SpeechEntry[]> {
    return this.#service.getSpeech(options);
  }

  getText(options?: GetTextOptions): Promise<string> {
    return this.#service.getText(options);
  }

  clear(): Promise<void> {
    return this.#service.clear();
  }

  startSession(name: string, options?: StartSessionOptions): Promise<StartedSession> {
    return this.#service.startSession(name, options);
  }

  endSession(): Promise<void> {
    return this.#service.endSession();
  }

  sessions(): Promise<SessionList> {
    return this.#service.sessions();
  }

  mark(label: string): Promise<SpeechEntry> {
    return this.#service.mark(label);
  }

  status(): Promise<BridgeStatus> {
    return this.#service.status();
  }

  waitForReady(options?: ReadyOptions): Promise<BridgeStatus> {
    return this.#service.waitForReady(options);
  }

  waitForOutput(match: SpeechMatch, options?: WaitOptions): Promise<SpeechEntry> {
    return this.#service.waitForOutput(match, options);
  }

  waitForSequence(matches: readonly SpeechMatch[], options?: WaitOptions): Promise<SpeechEntry[]> {
    return this.#service.waitForSequence(matches, options);
  }

  waitForSilence(options?: SilenceOptions): Promise<void> {
    return this.#service.waitForSilence(options);
  }

  record<T>(fn: () => T | Promise<T>, options?: SilenceOptions): Promise<Recording<T>> {
    return this.#service.record(fn, options);
  }

  onSpeech(listener: (entry: SpeechEntry) => void, options?: OnSpeechOptions): () => void {
    return this.#service.onSpeech(listener, options);
  }

  cursor(): number {
    return this.#service.cursor();
  }

  setCursor(seq: number): void {
    this.#service.setCursor(seq);
  }
}
