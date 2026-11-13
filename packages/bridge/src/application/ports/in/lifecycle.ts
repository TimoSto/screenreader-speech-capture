import type { BridgeState } from './get-status.js';

// Lifecycle ports. Only the composition root drives them (docs/operations.md#startup,
// docs/operations.md#shutdown); no adapter gets them, so the HTTP API can't change the state.

/** Moves the bridge state reported by `GET /status`. */
export interface BridgeStateControl {
  setState(state: BridgeState): void;
}

/** Ends pending work for shutdown, so it answers before the connections close. */
export interface Shutdown {
  shutdown(): void;
}
