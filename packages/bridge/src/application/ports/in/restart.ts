/**
 * Restarts the whole bridge so changed settings take effect
 * (docs/usage/operations.md#restarting-the-bridge). Separate from the lifecycle ports, which no
 * adapter gets: this is the one way the API ends the process, and only where a restart is possible.
 */
export interface RestartBridge {
  /** False when the bridge can't start a new copy of itself, for example in development. */
  canRestart(): boolean;
  /**
   * Stops the bridge, then starts a new copy with the same arguments. Returns at once. Throws
   * `SERVICE_UNAVAILABLE` if `canRestart()` is false.
   */
  restart(): void;
}
