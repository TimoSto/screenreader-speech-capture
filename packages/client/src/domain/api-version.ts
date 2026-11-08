import { IncompatibleBridgeError } from './errors.js';

/** Major part of a `<major>.<minor>` API version, `undefined` if it isn't one. */
function major(version: string): number | undefined {
  const match = /^(\d+)\.\d+$/.exec(version);
  return match ? Number(match[1]) : undefined;
}

/**
 * Throws {@link IncompatibleBridgeError} unless the bridge's API has the client's major version
 * (docs/http-api.md#versioning). A newer or older minor version is fine: minor versions only add
 * things.
 */
export function checkApiVersion(bridgeApiVersion: string, clientApiVersion: string): void {
  const bridge = major(bridgeApiVersion);
  if (bridge === undefined || bridge !== major(clientApiVersion)) {
    throw new IncompatibleBridgeError(bridgeApiVersion, clientApiVersion);
  }
}
