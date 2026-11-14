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

/**
 * What the capture adapters reported about their listener and connections, for the status. The
 * adapters report through the `TrackCapture` port; nothing reads their internals.
 */
export class CaptureState {
  #listener: ListenerState | null = null;
  readonly #connections = new Map<number, ConnectionInfo>();

  captureStatus(): CaptureStatus {
    return {
      listener: this.#listener && { ...this.#listener },
      connections: [...this.#connections.values()].map((connection) => ({ ...connection })),
    };
  }

  listening(listener: Omit<ListenerState, 'listening'>): void {
    this.#listener = { ...listener, listening: true };
  }

  /** The listener stopped; it keeps its address for the status. */
  stoppedListening(): void {
    if (this.#listener) this.#listener = { ...this.#listener, listening: false };
  }

  connectionOpened(id: number, connectedAt: Date): void {
    this.#connections.set(id, { id, voice: null, connectedAt });
  }

  voiceIdentified(id: number, voice: string): void {
    const connection = this.#connections.get(id);
    if (connection) this.#connections.set(id, { ...connection, voice });
  }

  connectionClosed(id: number): void {
    this.#connections.delete(id);
  }
}
