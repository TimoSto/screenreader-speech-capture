import type { HttpServer } from '../adapters/in/http/http-server.js';
import type { TcpListener } from '../adapters/in/tcp/tcp-listener.js';
import { toConfigError } from '../adapters/shared/net/listen.js';
import type { MemorySpeechRepository } from '../adapters/out/memory/memory-speech-repository.js';
import type { Logger } from '../application/ports/out/logger.js';
import type { SessionRepository } from '../application/ports/out/session-repository.js';
import type { ConfigService } from '../application/services/config-service.js';
import { pruneEndedSessions } from '../application/shared/sessions.js';
import { changedSections } from '../domain/config/index.js';
import type { Logging } from './logging.js';
import type { ChildService } from './services.js';

/** The ports the listeners are bound to. Updated when a restart moves them. */
export interface Ports {
  tcp: number;
  http: number;
}

/**
 * Live re-apply of PUT /api/v1/config (docs/configuration.md#changing-settings). Each step
 * leaves its part as it was when it fails, and ConfigService undoes the steps before it.
 */
export function registerReapply(
  config: ConfigService,
  parts: {
    tcp: TcpListener;
    http: HttpServer;
    repository: MemorySpeechRepository;
    sessions: SessionRepository;
    logging: Logging;
    services: readonly ChildService[];
    logger: Logger;
    ports: Ports;
  },
): void {
  const { tcp, http, repository, sessions, logging, services, logger, ports } = parts;

  config.onChange(async (next, previous) => {
    if (!changedSections(previous, next).includes('tcp')) return;
    try {
      ports.tcp = await tcp.restart(next.tcp);
    } catch (error) {
      throw toConfigError('tcp', error);
    }
  });
  config.onChange(async (next, previous) => {
    if (!changedSections(previous, next).includes('http')) return;
    try {
      ports.http = await http.restart(next.http);
    } catch (error) {
      throw toConfigError('http', error);
    }
  });
  config.onChange((next) => {
    repository.setMaxEntries(next.buffer.maxEntries);
    // A smaller buffer can drop the last entries of ended sessions.
    pruneEndedSessions(sessions, repository);
  });
  config.onChange((next, previous) => logging.apply(next, previous));

  // Last, because they never fail: the steps before them are not undone because of them.
  for (const { section, supervisor, settingsOf } of services) {
    config.onChange(async (next, previous) => {
      const changed = changedSections(previous, next);
      const hostChanged = changed.includes('http') && next.http.host !== previous.http.host;
      if (!changed.includes(section) && !hostChanged) return;
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
