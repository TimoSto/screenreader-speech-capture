// Composition root: the only place that knows the concrete adapters (docs/architecture.md).
import { API_VERSION } from '@screenreader-speech-capture/shared';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { FsClientConfigStore } from './adapters/out/fs-config/fs-client-config-store.js';
import { clientConfigFile } from './adapters/out/fs-config/paths.js';
import { FetchBridgeApi } from './adapters/out/http/fetch-bridge-api.js';
import type { ManageClientConfig } from './application/ports/in/manage-client-config.js';
import { ClientConfigService } from './application/services/client-config-service.js';
import { SpeechCaptureService } from './application/services/speech-capture-service.js';
import { URL_ENV } from './domain/bridge-url.js';

/**
 * The client's per-user settings, stored in the config file (docs/client.md#bridge-url).
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
   * config file, then `http://localhost:5151` (docs/client.md#bridge-url).
   */
  baseUrl?: string | undefined;
  /** Where `SR_SPEECH_URL` and `SR_SPEECH_CLIENT_CONFIG` are read. Default `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Talks to the bridge (docs/client.md#library): `new SpeechCaptureClient()` uses the stored
 * bridge URL. The URL is resolved on the first request.
 */
export class SpeechCaptureClient extends SpeechCaptureService {
  constructor(options: SpeechCaptureClientOptions = {}) {
    const config = createClientConfig(options.env ?? process.env);
    super({
      api: new FetchBridgeApi({
        baseUrl: async () => (await config.get('url', { url: options.baseUrl })).value,
      }),
      clock: new SystemClock(),
      apiVersion: API_VERSION,
    });
  }
}
