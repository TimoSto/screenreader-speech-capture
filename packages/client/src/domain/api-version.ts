import { IncompatibleBridgeError } from './errors.js';

/** `[major, minor]` of a `<major>.<minor>` API version, `undefined` if it isn't one. */
function parse(version: string): [number, number] | undefined {
  const match = /^(\d+)\.(\d+)$/.exec(version);
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

const major = (version: string): number | undefined => parse(version)?.[0];

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

/**
 * Throws {@link IncompatibleBridgeError} if the bridge's API is older than `needed` (same major,
 * lower minor): `feature` was added in that minor version.
 */
export function requireApiVersion(bridgeApiVersion: string, needed: string, feature: string): void {
  const bridge = parse(bridgeApiVersion);
  const want = parse(needed);
  if (bridge && want && bridge[0] === want[0] && bridge[1] >= want[1]) return;
  throw new IncompatibleBridgeError(
    bridgeApiVersion,
    needed,
    `${feature} need a bridge with API ${needed} or newer, this one speaks API ${bridgeApiVersion}. ` +
      'Update the bridge.',
  );
}
