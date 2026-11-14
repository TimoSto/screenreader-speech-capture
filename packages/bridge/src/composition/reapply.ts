import type { HttpServer } from '../adapters/in/http/http-server.js';
import type { Logger } from '../application/ports/out/logger.js';
import type { ResizeBuffer } from '../application/ports/in/speech.js';
import type { ConfigService } from '../application/services/config-service.js';
import { changedSections } from '../domain/config/index.js';
import type { BridgeLog } from '../adapters/out/log/bridge-log.js';
import type { ChildService } from './services.js';

/**
 * Live re-apply of PUT /api/v1/config (docs/configuration.md#changing-settings). Only settings
 * that can change without failing get here; the listeners' addresses and the log output wait for
 * the next start (`RESTART_FIELDS`).
 */
export function registerReapply(
  config: ConfigService,
  parts: {
    http: Pick<HttpServer, 'setAllowedHosts'>;
    buffer: ResizeBuffer;
    log: Pick<BridgeLog, 'setLevel'>;
    services: readonly ChildService[];
    logger: Logger;
  },
): void {
  const { http, buffer, log, services, logger } = parts;

  config.onChange((next) => http.setAllowedHosts(next.http.allowedHosts));
  config.onChange((next) => buffer.setMaxEntries(next.buffer.maxEntries));
  config.onChange((next) => log.setLevel(next.log.level));

  for (const { section, supervisor, settingsOf } of services) {
    config.onChange(async (next, previous) => {
      if (!changedSections(previous, next).includes(section)) return;
      supervisor.reconfigure(settingsOf(next));
      // Not awaited: an install can take minutes. `status` shows the progress.
      if (next[section].enabled) {
        supervisor.restart().catch((error: unknown) => {
          logger.error(`${section} restart failed: ${String(error)}`);
        });
      } else {
        await supervisor.stop();
      }
    });
  }
}
