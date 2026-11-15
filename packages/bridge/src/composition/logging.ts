import { BridgeLog, type LogSink } from '../adapters/out/log/bridge-log.js';
import { terminalWriter } from '../adapters/out/log/async-console.js';
import { consoleSink } from '../adapters/out/log/console-sink.js';
import { fileSink } from '../adapters/out/log/file-sink.js';
import { defaultLogFile } from '../adapters/out/platform/paths.js';
import type { Config } from '../domain/config/index.js';

/** The startup banner: one fact per line, so each is easy to find. */
function startupMessage(config: Config, version: string, configFile: string, file: string | null) {
  const { level, consoleSpeech } = config.log;
  const lines = [
    `version ${version}`,
    `config  ${configFile}`,
    `log     level ${level}, ${file === null ? 'console only' : `file ${file}`}`,
  ];
  if (level !== 'debug') lines.push('speech text is logged at debug');
  else if (consoleSpeech) lines.push('speech text also on the console');
  else if (file === null) lines.push('speech text is not shown: no log file');
  else lines.push('speech text goes to the log file only, not to the console');
  return lines.join('\n');
}

function defaultSinks(config: Config): { sinks: LogSink[]; file: string } {
  const file = config.log.file ?? defaultLogFile();
  return {
    sinks: [
      consoleSink({ speech: config.log.consoleSpeech, write: terminalWriter() }),
      fileSink(file),
    ],
    file,
  };
}

/**
 * The bridge log on the console and `config.log.file`, or on `sinks` (tests). Writes the
 * startup line.
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
