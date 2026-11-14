import type { CaptureState } from '../../domain/capture.js';
import type { Config } from '../../domain/config/index.js';
import type { SpeechLog } from '../../domain/speech-log.js';
import type { BridgeState, GetStatus, Status } from '../ports/in/get-status.js';
import type { BridgeStateControl } from '../ports/in/lifecycle.js';
import type { ProcessSupervisor } from '../ports/out/process-supervisor.js';

export interface StatusServiceDeps {
  capture: Pick<CaptureState, 'captureStatus'>;
  log: Pick<SpeechLog, 'stats' | 'sessions' | 'currentSession'>;
  playwright: Pick<ProcessSupervisor, 'status'>;
  mcp: Pick<ProcessSupervisor, 'status'>;
  /**
   * The active configuration. A getter, not the `ReadConfig` use case: services depend on
   * out-ports and values, not on other driving ports.
   */
  config: () => Config;
  /** Package version of the bridge. */
  version: string;
  /** `<major>.<minor>` of the HTTP API. */
  apiVersion: string;
  /** When this bridge run started. */
  startedAt: Date;
}

/**
 * `GET /api/v1/status`. The composition root moves the state from `starting` to `ready` through
 * `BridgeStateControl`.
 */
export class StatusService implements GetStatus, BridgeStateControl {
  private state: BridgeState = 'starting';

  constructor(private readonly deps: StatusServiceDeps) {}

  setState(state: BridgeState): void {
    this.state = state;
  }

  status(): Status {
    const { capture, log, playwright, mcp, config, version, apiVersion, startedAt } = this.deps;
    const { listener, connections } = capture.captureStatus();
    const { tcp } = config();
    const listed = log.sessions();
    const currentId = log.currentSession()?.id;
    return {
      bridge: {
        version,
        apiVersion,
        state: this.state,
        startedAt,
      },
      tcp: {
        listening: listener?.listening ?? false,
        host: listener?.host ?? tcp.host,
        port: listener?.port ?? tcp.port,
        encoding: listener?.encoding ?? tcp.encoding,
        connections,
      },
      buffer: log.stats(),
      playwright: playwright.status(),
      mcp: mcp.status(),
      session: {
        current: listed.find((session) => session.id === currentId) ?? null,
        count: listed.length,
      },
    };
  }
}
