import type { BridgeState } from './get-status.js';

// Lifecycle ports. Only the composition root drives them (docs/usage/operations.md#startup,
// docs/usage/operations.md#shutdown); no adapter gets them, so the HTTP API can't change the state.

/** Moves the bridge state reported by `GET /status`. */
export interface BridgeStateControl {
  setState(state: BridgeState): void;
}

/** Ends pending work for shutdown, so it answers before the connections close. */
export interface Shutdown {
  shutdown(): void;
}

/** Something the shutdown stops, for example a listener. */
export interface Stoppable {
  stop(): Promise<void>;
}

/**
 * Startup and shutdown of the bridge (docs/usage/operations.md#startup,
 * docs/usage/operations.md#shutdown).
 */
export interface BridgeLifecycle {
  /**
   * Starts the child services in the background, so the API is usable during an install. The
   * state becomes `ready` once each enabled service is running or has failed.
   */
  start(): void;
  /**
   * `stopping`, then pending waits answer, then each part stops in order, even if one before it
   * failed. Calling it again returns the same shutdown.
   */
  stop(reason?: string): Promise<void>;
}
