import { BridgeLog, type LogSink } from '../adapters/out/log/bridge-log.js';
import { consoleSink } from '../adapters/out/log/console-sink.js';
import { fileSink } from '../adapters/out/log/file-sink.js';
import { defaultLogFile } from '../adapters/out/platform/paths.js';
import type { Config } from '../domain/config/index.js';

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

/**
 * The bridge log on the console and `config.log.file`, or on `sinks` (tests). Writes the
 * startup line. A new level applies at once (`setLevel`); a new file or `consoleSpeech` on the
 * next start.
 */
export function createLogging(
  config: Config,
  options: { version: string; configLocation: string; sinks?: LogSink[] | undefined },
): BridgeLog {
  const { sinks, file } =
    options.sinks === undefined ? defaultSinks(config) : { sinks: options.sinks, file: null };
  const log = new BridgeLog(config.log.level, sinks);
  // Always written, so the console shows which version, config, log level and log file are in use.
  log.always('bridge', startupMessage(config, options.version, options.configLocation, file));
  return log;
}
