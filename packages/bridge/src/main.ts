// Composition root: the only place that knows the concrete adapters (docs/architecture.md).
import { TcpListener } from './adapters/in/tcp/tcp-listener.js';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { UlidGenerator } from './adapters/out/clock/ulid-generator.js';
import { BridgeLog, consoleSink } from './adapters/out/log/log.js';
import { InProcessEventBus } from './adapters/out/memory/in-process-event-bus.js';
import { RingBufferRepository } from './adapters/out/memory/ring-buffer-repository.js';
import type { Clock } from './application/ports/out/clock.js';
import { RecordSpeechService } from './application/services/record-speech-service.js';
import { SpeechService } from './application/services/speech-service.js';
import type { Config } from './domain/config.js';

export interface BridgeOptions {
  config: Config;
  version: string;
  /** Defaults to a console log with `config.log.level`. */
  log?: BridgeLog;
  clock?: Clock;
}

export interface Bridge {
  readonly log: BridgeLog;
  readonly tcpPort: number;
  readonly speech: SpeechService;
  readonly recorder: RecordSpeechService;
  stop(): Promise<void>;
}

export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const { config, version } = options;
  const log = options.log ?? new BridgeLog(config.log.level, [consoleSink()]);
  const bridgeLogger = log.for('bridge');
  // Always written, so the console shows which version and log level are running.
  log.always(
    'bridge',
    `starting, version ${version}, log level ${config.log.level}` +
      (config.log.level === 'debug' ? '' : ' (set SR_SPEECH_LOG_LEVEL=debug to see the speech)'),
  );

  const clock = options.clock ?? new SystemClock();
  const ids = new UlidGenerator();
  const repository = new RingBufferRepository(config.buffer.maxEntries);
  const events = new InProcessEventBus((error) =>
    bridgeLogger.error(`event listener failed: ${String(error)}`),
  );

  const recorder = new RecordSpeechService({
    repository,
    events,
    clock,
    ids,
    logger: log.for('speech-capture'),
  });
  const speech = new SpeechService({ repository, events, clock, ids });

  // The TCP listener starts first, so no speech is lost while the rest starts.
  const tcp = new TcpListener(recorder, log.for('speech-capture'));
  const tcpPort = await tcp.start(config.tcp);

  bridgeLogger.info('ready');

  return {
    log,
    tcpPort,
    speech,
    recorder,
    async stop() {
      bridgeLogger.info('stopping');
      await tcp.stop();
      bridgeLogger.info('stopped');
    },
  };
}
