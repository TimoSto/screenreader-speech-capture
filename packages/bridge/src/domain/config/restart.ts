import type { Config, ConfigField } from './types.js';

/**
 * Settings that only take effect on the next start (docs/configuration.md#changing-settings):
 * the listeners' addresses and the log output. Changing them live would mean moving open
 * connections, which a development tool doesn't need.
 */
export const RESTART_FIELDS: ReadonlySet<ConfigField> = new Set<ConfigField>([
  'tcp.host',
  'tcp.port',
  'tcp.encoding',
  'tcp.maxLineBytes',
  'http.host',
  'http.port',
  'log.file',
  'log.consoleSpeech',
]);

/** `next` with the settings of {@link RESTART_FIELDS} kept as they are in `running`. */
export function liveConfig(next: Config, running: Config): Config {
  return {
    ...next,
    tcp: running.tcp,
    http: { ...next.http, host: running.http.host, port: running.http.port },
    log: { ...next.log, file: running.log.file, consoleSpeech: running.log.consoleSpeech },
  };
}
