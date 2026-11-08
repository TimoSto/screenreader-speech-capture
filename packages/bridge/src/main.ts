// Composition root: the only place that knows the concrete adapters (docs/architecture.md).
import { API_VERSION } from '@screenreader-speech-capture/shared';
import { HttpServer } from './adapters/in/http/http-server.js';
import { ListenError } from './adapters/in/net/listen.js';
import { TcpListener } from './adapters/in/tcp/tcp-listener.js';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { FsConfigStore } from './adapters/out/fs-config/fs-config-store.js';
import { fileSink } from './adapters/out/log/file-sink.js';
import { BridgeLog, consoleSink, type LogSink } from './adapters/out/log/log.js';
import { logSpeechTranscript } from './adapters/out/log/speech-transcript.js';
import { InProcessEventBus } from './adapters/out/memory/in-process-event-bus.js';
import { MemorySpeechRepository } from './adapters/out/memory/memory-speech-repository.js';
import { defaultConfigFile, defaultLogFile } from './adapters/out/paths.js';
import type { AddMarker } from './application/ports/in/add-marker.js';
import type { ClearSpeech } from './application/ports/in/clear-speech.js';
import type { QuerySpeech } from './application/ports/in/query-speech.js';
import type { CaptureStatusSource } from './application/ports/out/capture-status.js';
import type { Clock } from './application/ports/out/clock.js';
import type { ConfigStore } from './application/ports/out/config-store.js';
import type { Logger } from './application/ports/out/logger.js';
import { ConfigService } from './application/services/config-service.js';
import { SpeechService } from './application/services/speech-service.js';
import { StatusService } from './application/services/status-service.js';
import { WaitForSpeechService } from './application/services/wait-for-speech-service.js';
import {
  changedSections,
  configFields,
  DEFAULT_CONFIG,
  mergeConfig,
  overriddenFields,
  validatePatch,
  type Config,
  type ConfigField,
  type ConfigPatch,
} from './domain/config.js';
import { AppError } from './domain/errors.js';

export interface BridgeOptions {
  version: string;
  /** Settings from flags and environment variables. They win over the config file. */
  overrides?: unknown;
  /** What sets each override, for example `--tcp-port` or `SR_SPEECH_TCP_PORT`. */
  overrideSources?: ReadonlyMap<ConfigField, string>;
  /** The config file. Default: `configFile`, or the default location. Tests pass their own. */
  configStore?: ConfigStore;
  configFile?: string;
  /**
   * Where the bridge log goes. Defaults to the console and `config.log.file` (`null`: the default
   * log file). Tests pass their own sinks.
   */
  sinks?: LogSink[];
  clock?: Clock;
  /** Interval of the SSE `: ping` comment. Default 15 s. */
  ssePingMs?: number;
}

export interface Bridge {
  readonly tcpPort: number;
  readonly httpPort: number;
  readonly speech: QuerySpeech & ClearSpeech & AddMarker;
  readonly capture: CaptureStatusSource;
  /** The `[bridge]` log, for lifecycle messages from outside (signals, crashes). */
  readonly log: Logger;
  /**
   * Stops the bridge (docs/operations.md#shutdown). `reason`, for example the signal, goes into
   * the log. Calling it again returns the same shutdown.
   */
  stop(reason?: string): Promise<void>;
}

/** A setting from flags, the environment or the config file is invalid. Nothing was started. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';
}

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

/** `patch` checked, with an error that says where the bad setting came from. */
function checked(patch: unknown, origin: (field: string | undefined) => string): ConfigPatch {
  try {
    return validatePatch(patch);
  } catch (error) {
    const field = error instanceof AppError ? (error.details?.field as string) : undefined;
    throw new ConfigError(`${origin(field)}: ${(error as Error).message}`, { cause: error });
  }
}

/** Defaults, then the config file, then flags and environment variables. */
async function loadConfig(
  store: ConfigStore,
  overridesPatch: unknown,
  sourceOf: (field: ConfigField) => string,
) {
  let saved: unknown;
  try {
    saved = await store.load();
  } catch (error) {
    throw new ConfigError((error as Error).message, { cause: error });
  }
  const file = checked(saved, () => `Invalid setting in the config file ${store.location}`);
  const overrides = checked(overridesPatch, (field) =>
    field?.includes('.') ? `Invalid ${sourceOf(field as ConfigField)}` : 'Invalid setting',
  );
  const config = mergeConfig(mergeConfig(DEFAULT_CONFIG, file), overrides);
  return { config, file, overrides };
}

/** `INVALID_REQUEST` naming the setting, for a listener that can't use a new address. */
function listenFailed(section: 'tcp' | 'http', error: unknown): unknown {
  if (!(error instanceof ListenError)) return error;
  const field = error.code === 'EADDRNOTAVAIL' ? `${section}.host` : `${section}.port`;
  return new AppError('INVALID_REQUEST', `${field}: ${error.message}`, { field });
}

const show = (value: unknown) => JSON.stringify(value);

/**
 * Starts the bridge. An invalid setting rejects with a `ConfigError` before anything starts.
 * Any other failure to start is written to the bridge log before the promise rejects, and so is
 * a failure to stop.
 */
export async function startBridge(options: BridgeOptions): Promise<Bridge> {
  const { version } = options;
  const store = options.configStore ?? new FsConfigStore(options.configFile ?? defaultConfigFile());
  const sourceOf = (field: ConfigField) =>
    options.overrideSources?.get(field) ?? 'a flag or environment variable';
  const {
    config,
    file: savedFile,
    overrides,
  } = await loadConfig(store, options.overrides, sourceOf);

  const ownSinks = options.sinks === undefined;
  const initial = ownSinks ? defaultSinks(config) : { sinks: options.sinks ?? [], file: null };
  let sinks = initial.sinks;
  const log = new BridgeLog(config.log.level, sinks);
  const bridgeLogger = log.for('bridge');
  const configLogger = log.for('config');
  // Always written, so the console shows which version, config, log level and log file are in use.
  log.always('bridge', startupMessage(config, version, store.location, initial.file));

  for (const { field, file: saved, override } of overriddenFields(savedFile, overrides)) {
    configLogger.warn(
      `${field}: the config file sets ${show(saved)}, but ${sourceOf(field)} sets ${show(override)}, which wins`,
    );
  }

  const clock = options.clock ?? new SystemClock();
  const repository = new MemorySpeechRepository(config.buffer.maxEntries);
  const events = new InProcessEventBus((error) =>
    bridgeLogger.error(`event listener failed: ${String(error)}`),
  );

  logSpeechTranscript(events, log.for('speech-capture', { channel: 'speech' }));
  const speech = new SpeechService({ repository, events, clock });
  const waits = new WaitForSpeechService({ repository, events });
  const configService = new ConfigService({
    store,
    logger: configLogger,
    active: config,
    file: savedFile,
    pinned: new Map([...configFields(overrides).keys()].map((field) => [field, sourceOf(field)])),
  });

  const tcp = new TcpListener(speech, clock, log.for('speech-capture'));
  const status = new StatusService({
    capture: tcp,
    repository,
    config: () => configService.get(),
    version,
    apiVersion: API_VERSION,
  });
  const http = new HttpServer({
    speech,
    waits,
    status,
    config: configService,
    logger: log.for('http-api'),
    ...(options.ssePingMs === undefined ? {} : { pingMs: options.ssePingMs }),
  });

  const failed = (error: unknown) =>
    bridgeLogger.error(error instanceof ListenError ? error.message : String(error));

  // Startup order (docs/operations.md#startup): the TCP listener first, so no speech is lost
  // while the rest starts, then HTTP.
  let tcpPort: number;
  let httpPort: number;
  try {
    tcpPort = await tcp.start(config.tcp);
  } catch (error) {
    failed(error);
    throw error;
  }
  try {
    httpPort = await http.start(config.http);
  } catch (error) {
    failed(error);
    await tcp.stop();
    throw error;
  }

  // Live re-apply of PUT /api/v1/config (docs/configuration.md#changing-settings). Each step
  // leaves its part as it was when it fails, and ConfigService undoes the steps before it.
  configService.onChange(async (next, previous) => {
    if (!changedSections(previous, next).includes('tcp')) return;
    // The port it had, which differs from the setting when that was 0.
    const before = { ...previous.tcp, port: tcpPort };
    await tcp.stop();
    try {
      tcpPort = await tcp.start(next.tcp);
    } catch (error) {
      tcpPort = await tcp.start(before);
      throw listenFailed('tcp', error);
    }
  });
  configService.onChange(async (next, previous) => {
    if (!changedSections(previous, next).includes('http')) return;
    try {
      httpPort = await http.restart(next.http);
    } catch (error) {
      throw listenFailed('http', error);
    }
  });
  configService.onChange((next) => repository.setMaxEntries(next.buffer.maxEntries));
  configService.onChange((next, previous) => {
    log.setLevel(next.log.level);
    if (
      !ownSinks ||
      (next.log.file === previous.log.file && next.log.consoleSpeech === previous.log.consoleSpeech)
    ) {
      return;
    }
    for (const sink of sinks) log.removeSink(sink);
    sinks = defaultSinks(next).sinks;
    for (const sink of sinks) log.addSink(sink);
  });

  status.setState('ready');
  bridgeLogger.info('ready');

  let stopping: Promise<void> | undefined;

  return {
    get tcpPort() {
      return tcpPort;
    },
    get httpPort() {
      return httpPort;
    },
    speech,
    capture: tcp,
    log: bridgeLogger,
    stop(reason?: string) {
      stopping ??= shutdown(reason);
      return stopping;
    },
  };

  async function shutdown(reason: string | undefined): Promise<void> {
    status.setState('stopping');
    bridgeLogger.info(reason === undefined ? 'stopping' : `stopping (${reason})`);
    // Pending waits answer 503 before the HTTP server closes their connections.
    waits.shutdown();
    // Each listener stops even if the one before it failed.
    const errors: unknown[] = [];
    for (const listener of [http, tcp]) {
      try {
        await listener.stop();
      } catch (error) {
        bridgeLogger.error(`shutdown failed: ${String(error)}`);
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'shutdown failed');
    bridgeLogger.info('stopped');
  }
}
