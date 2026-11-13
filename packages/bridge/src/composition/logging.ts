import { fileSink } from '../adapters/out/log/file-sink.js';
import { BridgeLog, consoleSink, type LogSink } from '../adapters/out/log/log.js';
import { defaultLogFile } from '../adapters/out/platform/paths.js';
import type { Config } from '../domain/config.js';

function startupMessage(config: Config, version: string, configFile: string, file: string | null) {
  const { level, consoleSpeech } = config.log;
  let message = `starting, version ${version}, config ${configFile}, log level ${level}`;
  if (file !== null) message += `, log file ${file}`;
  if (level !== 'debug') return `${message} (speech text is logged at debug)`;
  if (consoleSpeech) return `${message} (speech text also on the console)`;
  return file === null
    ? `${message} (speech text is not shown: no log file)`
    : `${message} (speech text goes to the log file only, not to the console)`;
}

function defaultSinks(config: Config): { sinks: LogSink[]; file: string } {
  const file = config.log.file ?? defaultLogFile();
  return { sinks: [consoleSink({ speech: config.log.consoleSpeech }), fileSink(file)], file };
}

export interface Logging {
  readonly log: BridgeLog;
  /** Applies changed `log.*` settings: the level, and new sinks if the bridge owns them. */
  apply(next: Config, previous: Config): void;
}

/**
 * The bridge log on the console and `config.log.file`, or on `sinks` (tests). Writes the
 * startup line.
 */
export function createLogging(
  config: Config,
  options: { version: string; configLocation: string; sinks?: LogSink[] | undefined },
): Logging {
  const ownSinks = options.sinks === undefined;
  const initial = ownSinks ? defaultSinks(config) : { sinks: options.sinks ?? [], file: null };
  let sinks = initial.sinks;
  const log = new BridgeLog(config.log.level, sinks);
  // Always written, so the console shows which version, config, log level and log file are in use.
  log.always(
    'bridge',
    startupMessage(config, options.version, options.configLocation, initial.file),
  );

  return {
    log,
    apply(next, previous) {
      log.setLevel(next.log.level);
      if (
        !ownSinks ||
        (next.log.file === previous.log.file &&
          next.log.consoleSpeech === previous.log.consoleSpeech)
      ) {
        return;
      }
      for (const sink of sinks) log.removeSink(sink);
      sinks = defaultSinks(next).sinks;
      for (const sink of sinks) log.addSink(sink);
    },
  };
}
