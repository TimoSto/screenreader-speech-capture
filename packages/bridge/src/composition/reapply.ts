import type { HttpServer } from '../adapters/in/http/http-server.js';
import type { BridgeLog } from '../adapters/out/log/bridge-log.js';
import type { ChildServices } from '../application/ports/in/child-services.js';
import type { ResizeBuffer } from '../application/ports/in/speech.js';
import type { ConfigService } from '../application/services/config-service.js';

/**
 * Live re-apply of PUT /api/v1/config (docs/usage/configuration.md#changing-settings): hands each
 * change to the parts that apply it. The listeners' addresses and the log output wait for the
 * next start (`RESTART_FIELDS`). The child services decide themselves what a change means for
 * them (`ChildServices.apply`).
 */
export function registerReapply(
  config: ConfigService,
  parts: {
    http: Pick<HttpServer, 'setAllowedHosts'>;
    buffer: ResizeBuffer;
    log: Pick<BridgeLog, 'setLevel'>;
    services: Pick<ChildServices, 'apply'>;
  },
): void {
  const { http, buffer, log, services } = parts;
  config.onChange((next) => http.setAllowedHosts(next.http.allowedHosts));
  config.onChange((next) => buffer.setMaxEntries(next.buffer.maxEntries));
  config.onChange((next) => log.setLevel(next.log.level));
  config.onChange((next, previous) => services.apply(next, previous));
}
