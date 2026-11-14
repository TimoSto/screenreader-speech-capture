// Composition root, with the helpers in composition/: the only place that knows the concrete
// adapters (docs/architecture.md).
import { hostname } from 'node:os';
import { API_VERSION } from '@screenreader-speech-capture/shared';
import { HttpServer } from './adapters/in/http/http-server.js';
import { TcpListener } from './adapters/in/tcp/tcp-listener.js';
import { SystemClock } from './adapters/out/clock/system-clock.js';
import { FsConfigStore } from './adapters/out/fs-config/fs-config-store.js';
import { InProcessEventBus } from './adapters/out/memory/in-process-event-bus.js';
import { defaultConfigFile } from './adapters/out/platform/paths.js';
import type { ManageSessions } from './application/ports/in/manage-sessions.js';
import type { SpeechUseCases } from './application/ports/in/speech.js';
import type { Logger } from './application/ports/out/logger.js';
import { BridgeLifecycleService } from './application/services/bridge-lifecycle-service.js';
import { CaptureService } from './application/services/capture-service.js';
import { ChildServicesService } from './application/services/child-services-service.js';
import { ConfigService } from './application/services/config-service.js';
import { SessionService } from './application/services/session-service.js';
import { SpeechService } from './application/services/speech-service.js';
import { StatusService } from './application/services/status-service.js';
import { TranscriptService } from './application/services/transcript-service.js';
import { WaitForSpeechService } from './application/services/wait-for-speech-service.js';
import { startListeners } from './composition/lifecycle.js';
import { loadConfig } from './composition/load-config.js';
import { createLogging } from './composition/logging.js';
import { yieldEvery } from './composition/pace.js';
import { registerReapply } from './composition/reapply.js';
import { proxyRoutes } from './composition/proxies.js';
import { createSupervisors } from './composition/services.js';
import type { TestSeams } from './composition/test-seams.js';
import { CaptureState } from './domain/capture.js';
import { configFields, overriddenFields, type ConfigField } from './domain/config/index.js';
import { SpeechLog } from './domain/speech-log.js';

export { ConfigError } from './composition/load-config.js';

export interface BridgeOptions {
  version: string;
  /** Settings from flags and environment variables. They win over the config file. */
  overrides?: unknown;
  /** What sets each override, for example `--tcp-port` or `SR_SPEECH_TCP_PORT`. */
  overrideSources?: ReadonlyMap<ConfigField, string>;
  /** The config file. Default: the default location. */
  configFile?: string;
  /** Replacements for tests. Production code leaves it out. */
  testSeams?: TestSeams;
}

export interface Bridge {
  readonly tcpPort: number;
  readonly httpPort: number;
  readonly speech: SpeechUseCases;
  readonly sessions: ManageSessions;
  readonly capture: Pick<CaptureState, 'captureStatus'>;
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
  const seams = options.testSeams ?? {};
  const store = seams.configStore ?? new FsConfigStore(options.configFile ?? defaultConfigFile());
  const sourceOf = (field: ConfigField) =>
    options.overrideSources?.get(field) ?? 'a flag or environment variable';
  const {
    config,
    file: savedFile,
    overrides,
  } = await loadConfig(store, options.overrides, sourceOf);

  const log = createLogging(config, {
    version,
    configLocation: store.location,
    sinks: seams.sinks,
  });
  const bridgeLogger = log.for('bridge');
  const configLogger = log.for('config');
  for (const { field, file: saved, override } of overriddenFields(savedFile, overrides)) {
    configLogger.warn(
      `${field}: the config file sets ${show(saved)}, but ${sourceOf(field)} sets ${show(override)}, which wins`,
    );
  }

  const clock = seams.clock ?? new SystemClock();
  const startedAt = clock.now();
  // `seq` starts at the start time, so it keeps rising across restarts (docs/http-api.md).
  const speechLog = new SpeechLog(config.buffer.maxEntries, startedAt.getTime());
  const events = new InProcessEventBus((error) =>
    bridgeLogger.error(`event listener failed: ${String(error)}`),
  );

  new TranscriptService({
    events,
    transcript: log.for('speech-capture', { channel: 'speech' }),
  }).start();
  const speech = new SpeechService({ log: speechLog, events, clock });
  const waits = new WaitForSpeechService({
    log: speechLog,
    events,
    // A long buffer lets speech capture run in between (docs/http-api.md, `/speech/wait`).
    pace: () => yieldEvery(256),
  });
  const sessions = new SessionService({
    log: speechLog,
    events,
    clock,
    logger: log.for('bridge'),
  });
  const configService = new ConfigService({
    store,
    logger: configLogger,
    active: config,
    file: savedFile,
    pinned: new Map([...configFields(overrides).keys()].map((field) => [field, sourceOf(field)])),
  });
  const supervisors = createSupervisors(config, seams, log);
  const childServices = new ChildServicesService({
    supervisors,
    config: () => configService.get(),
    logger: bridgeLogger,
  });

  const captureState = new CaptureState();
  const tcp = new TcpListener(
    speech,
    new CaptureService({ state: captureState, clock }),
    log.for('speech-capture'),
  );
  const status = new StatusService({
    capture: captureState,
    log: speechLog,
    playwright: supervisors.playwright,
    mcp: supervisors.mcp,
    config: () => configService.get(),
    version,
    apiVersion: API_VERSION,
    startedAt,
  });
  const http = new HttpServer({
    speech,
    waits,
    status,
    config: configService,
    sessions,
    logger: log.for('http-api'),
    hostnames: [hostname()],
    proxies: proxyRoutes(childServices),
    ...(seams.ssePingMs === undefined ? {} : { pingMs: seams.ssePingMs }),
  });

  const ports = await startListeners(tcp, http, config, bridgeLogger);
  registerReapply(configService, {
    http,
    buffer: speech,
    log,
    services: childServices,
  });
  const lifecycle = new BridgeLifecycleService({
    state: status,
    waits,
    startServices: () => childServices.startEnabled(),
    stopOrder: [http, tcp, { stop: () => childServices.stopAll() }],
    logger: bridgeLogger,
  });
  lifecycle.start();

  return {
    tcpPort: ports.tcp,
    httpPort: ports.http,
    speech,
    sessions,
    capture: captureState,
    log: bridgeLogger,
    stop: (reason) => lifecycle.stop(reason),
  };
}
