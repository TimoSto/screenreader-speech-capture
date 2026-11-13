// Composition root, with the helpers in composition/: the only place that knows the concrete
// adapters (docs/architecture.md).
import { API_VERSION } from '@screenreader-speech-capture/shared';
import { HttpServer } from './adapters/in/http/http-server.js';
import { TcpListener } from './adapters/in/tcp/tcp-listener.js';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { FsConfigStore } from './adapters/out/fs-config/fs-config-store.js';
import type { LogSink } from './adapters/out/log/log.js';
import { InProcessEventBus } from './adapters/out/memory/in-process-event-bus.js';
import { MemorySessionRepository } from './adapters/out/memory/memory-session-repository.js';
import { MemorySpeechRepository } from './adapters/out/memory/memory-speech-repository.js';
import { defaultConfigFile } from './adapters/out/platform/paths.js';
import type { Prepare } from './adapters/out/process/child-process-supervisor.js';
import type { AddMarker } from './application/ports/in/add-marker.js';
import type { ClearSpeech } from './application/ports/in/clear-speech.js';
import type { ManageSessions } from './application/ports/in/manage-sessions.js';
import type { QuerySpeech } from './application/ports/in/query-speech.js';
import type { CaptureStatusSource } from './application/ports/out/capture-status.js';
import type { Clock } from './application/ports/out/clock.js';
import type { ConfigStore } from './application/ports/out/config-store.js';
import type { Logger } from './application/ports/out/logger.js';
import { ConfigService } from './application/services/config-service.js';
import { SessionService } from './application/services/session-service.js';
import { SpeechService } from './application/services/speech-service.js';
import { StatusService } from './application/services/status-service.js';
import { TranscriptService } from './application/services/transcript-service.js';
import { WaitForSpeechService } from './application/services/wait-for-speech-service.js';
import { runLifecycle, startListeners } from './composition/lifecycle.js';
import { loadConfig } from './composition/load-config.js';
import { createLogging } from './composition/logging.js';
import { registerReapply } from './composition/reapply.js';
import { createServices } from './composition/services.js';
import { configFields, overriddenFields, type ConfigField } from './domain/config/index.js';

export { ConfigError } from './composition/load-config.js';

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
  /** Where Playwright versions are installed. Default: `defaultPlaywrightDir()`. */
  playwrightDir?: string;
  /** Replaces the Playwright install and `run-server` command (tests). */
  playwrightLaunch?: Prepare;
  /** Replaces the MCP Chromium install and command (tests). */
  mcpLaunch?: Prepare;
}

export interface Bridge {
  readonly tcpPort: number;
  readonly httpPort: number;
  readonly speech: QuerySpeech & ClearSpeech & AddMarker;
  readonly sessions: ManageSessions;
  readonly capture: CaptureStatusSource;
  /** The `[bridge]` log, for lifecycle messages from outside (signals, crashes). */
  readonly log: Logger;
  /**
   * Stops the bridge (docs/operations.md#shutdown). `reason`, for example the signal, goes into
   * the log. Calling it again returns the same shutdown.
   */
  stop(reason?: string): Promise<void>;
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

  const logging = createLogging(config, {
    version,
    configLocation: store.location,
    sinks: options.sinks,
  });
  const { log } = logging;
  const bridgeLogger = log.for('bridge');
  const configLogger = log.for('config');
  for (const { field, file: saved, override } of overriddenFields(savedFile, overrides)) {
    configLogger.warn(
      `${field}: the config file sets ${show(saved)}, but ${sourceOf(field)} sets ${show(override)}, which wins`,
    );
  }

  const clock = options.clock ?? new SystemClock();
  const repository = new MemorySpeechRepository(config.buffer.maxEntries);
  const sessionRepository = new MemorySessionRepository();
  const events = new InProcessEventBus((error) =>
    bridgeLogger.error(`event listener failed: ${String(error)}`),
  );

  new TranscriptService({
    events,
    transcript: log.for('speech-capture', { channel: 'speech' }),
  }).start();
  const speech = new SpeechService({ repository, events, clock, sessions: sessionRepository });
  const waits = new WaitForSpeechService({ repository, events, sessions: sessionRepository });
  const sessions = new SessionService({ sessions: sessionRepository, repository, events, clock });
  const configService = new ConfigService({
    store,
    logger: configLogger,
    active: config,
    file: savedFile,
    pinned: new Map([...configFields(overrides).keys()].map((field) => [field, sourceOf(field)])),
  });
  const services = createServices(config, options, log);

  const tcp = new TcpListener(speech, clock, log.for('speech-capture'));
  const status = new StatusService({
    capture: tcp,
    repository,
    sessions: sessionRepository,
    playwright: services.playwright,
    mcp: services.mcp,
    config: () => configService.get(),
    version,
    apiVersion: API_VERSION,
  });
  const http = new HttpServer({
    speech,
    waits,
    status,
    config: configService,
    sessions,
    logger: log.for('http-api'),
    ...(options.ssePingMs === undefined ? {} : { pingMs: options.ssePingMs }),
  });

  const ports = await startListeners(tcp, http, config, bridgeLogger);
  registerReapply(configService, {
    tcp,
    http,
    repository,
    logging,
    services: services.all,
    logger: bridgeLogger,
    ports,
  });
  const lifecycle = runLifecycle({
    config,
    status,
    waits,
    logger: bridgeLogger,
    services: services.all,
    stopOrder: [http, tcp, services.playwright, services.mcp],
  });

  return {
    get tcpPort() {
      return ports.tcp;
    },
    get httpPort() {
      return ports.http;
    },
    speech,
    sessions,
    capture: tcp,
    log: bridgeLogger,
    stop: (reason) => lifecycle.stop(reason),
  };
}
