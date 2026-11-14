import { IncompatibleBridgeError } from './errors.js';

/** The major version of a `<major>.<minor>` API version, `undefined` if it isn't one. */
function major(version: string): number | undefined {
  const match = /^(\d+)\.\d+$/.exec(version);
  return match ? Number(match[1]) : undefined;
}

/**
 * Throws {@link IncompatibleBridgeError} unless the bridge's API has the client's major version
 * (docs/http-api.md#versioning). Any minor version is accepted: the bridge and the client are
 * released together.
 */
export function checkApiVersion(bridgeApiVersion: string, clientApiVersion: string): void {
  const bridge = major(bridgeApiVersion);
  if (bridge === undefined || bridge !== major(clientApiVersion)) {
    throw new IncompatibleBridgeError(bridgeApiVersion, clientApiVersion);
  }
}
