/** The speech capture listener (for the TCP capture: the socket the voice connects to). */
export interface ListenerState {
  listening: boolean;
  host: string;
  port: number;
  encoding: string;
}

/** One open connection of a capture source. */
export interface ConnectionInfo {
  id: number;
  voice: string | null;
  connectedAt: Date;
}

/** What `GET /api/v1/status` reports about speech capture (`tcp`). */
export interface CaptureStatus {
  /** `null` before the listener was started for the first time. */
  listener: ListenerState | null;
  /** Open connections, oldest first. */
  connections: ConnectionInfo[];
}
