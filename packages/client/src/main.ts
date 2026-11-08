// Composition root: the only place that knows the concrete adapters (docs/architecture.md).
import { FsClientConfigStore } from './adapters/out/fs-config/fs-client-config-store.js';
import { clientConfigFile } from './adapters/out/fs-config/paths.js';
import type { ManageClientConfig } from './application/ports/in/manage-client-config.js';
import { ClientConfigService } from './application/services/client-config-service.js';
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
