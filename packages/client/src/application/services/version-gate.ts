import { checkApiVersion } from '../../domain/api-version.js';
import type { BridgeApi } from '../ports/out/bridge-api.js';

/**
 * Checks once that the bridge speaks this client's API version (major). A failed check is
 * repeated on the next call. Shared by the services that talk to one bridge.
 */
export class VersionGate {
  #checked: Promise<void> | undefined;

  constructor(
    private readonly api: Pick<BridgeApi, 'status'>,
    private readonly apiVersion: string,
  ) {}

  /** Resolves when the bridge is compatible, rejects with `IncompatibleBridgeError` if not. */
  ensure(): Promise<void> {
    this.#checked ??= this.api.status().then(
      (status) => this.#check(status.bridge.apiVersion),
      (error: unknown) => {
        this.#checked = undefined;
        throw error;
      },
    );
    return this.#checked;
  }

  /** A status the caller read anyway counts as the check. */
  passed(bridgeApiVersion: string): void {
    this.#check(bridgeApiVersion);
    this.#checked = Promise.resolve();
  }

  #check(bridgeApiVersion: string): void {
    try {
      checkApiVersion(bridgeApiVersion, this.apiVersion);
    } catch (error) {
      this.#checked = undefined;
      throw error;
    }
  }
}
