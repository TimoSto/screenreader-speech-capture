import type { SpeechEntry } from './speech-entry.js';

/** A wait ended without a match. `entries` holds the speech seen while waiting, oldest first. */
export class SpeechTimeoutError extends Error {
  override name = 'SpeechTimeoutError';

  constructor(
    message: string,
    readonly entries: SpeechEntry[],
  ) {
    super(message);
  }
}

/**
 * The bridge restarted since this client last read from it (its `instanceId` changed): the speech
 * and sessions recorded before are gone, and `seq` started again at 1. The client has moved its
 * cursor to the new bridge's start, so the next call works again.
 */
export class BridgeRestartedError extends Error {
  override name = 'BridgeRestartedError';

  constructor(
    /** `instanceId` of the bridge run the client read from before. */
    readonly previousInstanceId: string,
    /** `instanceId` of the bridge run now answering. */
    readonly instanceId: string,
  ) {
    super(
      'The bridge restarted: the speech recorded before is lost, and the cursor now starts at ' +
        "the new bridge's first entry",
    );
  }
}

/** `waitForReady` timed out: the bridge was not reachable or not `ready` in time. */
export class BridgeNotReadyError extends Error {
  override name = 'BridgeNotReadyError';
}

/**
 * The bridge speaks another major version of the HTTP API (docs/http-api.md#versioning), or an
 * older minor version that lacks a feature the call needs.
 */
export class IncompatibleBridgeError extends Error {
  override name = 'IncompatibleBridgeError';

  constructor(
    /** `bridge.apiVersion` reported by the bridge. */
    readonly bridgeApiVersion: string,
    /** The API version this client was built for. */
    readonly clientApiVersion: string,
    message = `The bridge speaks API ${bridgeApiVersion}, this client needs API ${clientApiVersion}. ` +
      'Install the bridge and the client in the same version.',
  ) {
    super(message);
  }
}

/** No connection to the bridge (wrong URL, bridge not running, network). */
export class BridgeUnreachableError extends Error {
  override name = 'BridgeUnreachableError';

  constructor(
    readonly url: string,
    options?: ErrorOptions,
  ) {
    const reason = describeCause(options?.cause);
    super(`The bridge at ${url} is not reachable${reason ? ` (${reason})` : ''}`, options);
  }
}

/** The bridge answered with an error (docs/http-api.md#errors). */
export class BridgeHttpError extends Error {
  override name = 'BridgeHttpError';

  constructor(
    readonly status: number,
    /** Machine-readable code, for example `INVALID_REQUEST`. New codes may appear. */
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(`${message} (HTTP ${status}, ${code})`);
  }
}

function describeCause(cause: unknown): string | undefined {
  if (!(cause instanceof Error)) return undefined;
  // fetch wraps the socket error: `TypeError: fetch failed` with `cause: { code: 'ECONNREFUSED' }`.
  const inner: unknown = cause.cause;
  if (typeof inner === 'object' && inner !== null && 'code' in inner) return String(inner.code);
  // For example `bad port` for a port fetch refuses to use, or a timeout's abort reason.
  return inner instanceof Error ? inner.message : cause.message;
}

/** The config file or a configured value is invalid. */
export class ClientConfigError extends Error {
  override name = 'ClientConfigError';
}
