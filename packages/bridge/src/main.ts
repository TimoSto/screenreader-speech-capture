// Composition root: the only place that knows the concrete adapters (docs/architecture.md).
import { ListenError } from './adapters/in/net/listen.js';
import { TcpListener } from './adapters/in/tcp/tcp-listener.js';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { fileSink } from './adapters/out/log/file-sink.js';
import { BridgeLog, consoleSink, type LogSink } from './adapters/out/log/log.js';
import { defaultLogFile } from './adapters/out/log/paths.js';
import { logSpeechTranscript } from './adapters/out/log/speech-transcript.js';
import { InProcessEventBus } from './adapters/out/memory/in-process-event-bus.js';
import { MemorySpeechRepository } from './adapters/out/memory/memory-speech-repository.js';
import type { AddMarker } from './application/ports/in/add-marker.js';
import type { ClearSpeech } from './application/ports/in/clear-speech.js';
import type { QuerySpeech } from './application/ports/in/query-speech.js';
import type { CaptureStatusSource } from './application/ports/out/capture-status.js';
import type { Clock } from './application/ports/out/clock.js';
import { SpeechService } from './application/services/speech-service.js';
import type { Config } from './domain/config.js';

export interface BridgeOptions {
  config: Config;
  version: string;
  /**
   * Where the bridge log goes. Defaults to the console and `config.log.file` (`null`: the default
   * log file). Tests pass their own sinks.
   */
  sinks?: LogSink[];
  clock?: Clock;
}

export interface Bridge {
  readonly tcpPort: number;
  readonly speech: QuerySpeech & ClearSpeech & AddMarker;
  readonly capture: CaptureStatusSource;
  stop(): Promise<void>;
}

function startupMessage(config: Config, version: string, file: string | null): string {
  const { level, consoleSpeech } = config.log;
  let message = `starting, version ${version}, log level ${level}`;
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
 * Starts the bridge. A failure to start is written to the bridge log before the promise rejects,
 * and so is a failure to stop.
 */
export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const { config, version } = options;
  const { sinks, file } = options.sinks
    ? { sinks: options.sinks, file: null }
    : defaultSinks(config);
  const log = new BridgeLog(config.log.level, sinks);
  const bridgeLogger = log.for('bridge');
  // Always written, so the console shows which version, log level and log file are in use.
  log.always('bridge', startupMessage(config, version, file));

  const clock = options.clock ?? new SystemClock();
  const repository = new MemorySpeechRepository(config.buffer.maxEntries);
  const events = new InProcessEventBus((error) =>
    bridgeLogger.error(`event listener failed: ${String(error)}`),
  );

  logSpeechTranscript(events, log.for('speech-capture', { channel: 'speech' }));
  const speech = new SpeechService({ repository, events, clock });

  // The TCP listener starts first, so no speech is lost while the rest starts.
  const tcp = new TcpListener(speech, clock, log.for('speech-capture'));
  let tcpPort: number;
  try {
    tcpPort = await tcp.start(config.tcp);
  } catch (error) {
    bridgeLogger.error(error instanceof ListenError ? error.message : String(error));
    throw error;
  }

  bridgeLogger.info('ready');

  return {
    tcpPort,
    speech,
    capture: tcp,
    async stop() {
      bridgeLogger.info('stopping');
      try {
        await tcp.stop();
      } catch (error) {
        bridgeLogger.error(`shutdown failed: ${String(error)}`);
        throw error;
      }
      bridgeLogger.info('stopped');
    },
  };
}
