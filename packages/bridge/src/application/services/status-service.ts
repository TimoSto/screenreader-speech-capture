import type { Config } from '../../domain/config.js';
import type { BridgeState, GetStatus, Status } from '../ports/in/get-status.js';
import type { CaptureStatusSource } from '../ports/out/capture-status.js';
import type { ProcessSupervisor } from '../ports/out/process-supervisor.js';
import type { SessionRepository } from '../ports/out/session-repository.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';
import { pruneAndListSessions } from '../shared/prune-and-list-sessions.js';

export interface StatusServiceDeps {
  capture: CaptureStatusSource;
  repository: SpeechRepository;
  sessions: SessionRepository;
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
}

/** `GET /api/v1/status`. The composition root moves the state from `starting` to `ready`. */
export class StatusService implements GetStatus {
  private state: BridgeState = 'starting';

  constructor(private readonly deps: StatusServiceDeps) {}

  setState(state: BridgeState): void {
    this.state = state;
  }

  status(): Status {
    const { capture, repository, sessions, playwright, mcp, config, version, apiVersion } =
      this.deps;
    const { listener, connections } = capture.captureStatus();
    const { tcp, input } = config();
    const listed = pruneAndListSessions(sessions, repository);
    const currentId = sessions.current()?.id;
    return {
      bridge: { version, apiVersion, state: this.state },
      tcp: {
        listening: listener?.listening ?? false,
        host: listener?.host ?? tcp.host,
        port: listener?.port ?? tcp.port,
        encoding: listener?.encoding ?? tcp.encoding,
        connections,
      },
      buffer: repository.stats(),
      playwright: playwright.status(),
      mcp: mcp.status(),
      input: { enabled: input.enabled },
      session: {
        current: listed.find((session) => session.id === currentId) ?? null,
        count: listed.length,
      },
    };
  }
}
