import type { SpeechEntry } from './speech-entry.js';

/** The last entries a {@link SpeechTimeoutError} message lists; `entries` holds them all. */
export const SEEN_IN_MESSAGE = 20;

/**
 * A wait ended without a match. `entries` holds the speech seen while waiting, oldest first.
 * `truncated`: some of the speech it should have looked at was dropped because the bridge's
 * buffer was full, so the match may have been among it. `reason` is the message without the
 * speech; `message` lists the last {@link SEEN_IN_MESSAGE} entries too, so a test report shows
 * what was said instead.
 */
export class SpeechTimeoutError extends Error {
  override name = 'SpeechTimeoutError';
  readonly reason: string;

  constructor(
    message: string,
    readonly entries: SpeechEntry[],
    readonly truncated = false,
  ) {
    const reason = truncated ? `${message}; ${TRUNCATED_HINT}` : message;
    super(`${reason}. ${seenSpeech(entries)}`);
    this.reason = reason;
  }
}

function seenSpeech(entries: SpeechEntry[]): string {
  if (entries.length === 0) return 'No speech arrived.';
  const shown = entries.slice(-SEEN_IN_MESSAGE);
  const earlier = entries.length - shown.length;
  const lines = shown.map(
    ({ seq, kind, text }) => `  #${seq} ${kind === 'marker' ? '[marker] ' : ''}${text}`,
  );
  if (earlier > 0) lines.unshift(`  … ${earlier} earlier (in error.entries)`);
  return `Speech seen (${entries.length}):\n${lines.join('\n')}`;
}

/**
 * `getSpeech` / `getText` without `allowTruncated`: some of the speech asked for was dropped
 * because the bridge's buffer was full, so the read would be incomplete. `entries` holds what is
 * left, oldest first.
 */
export class SpeechTruncatedError extends Error {
  override name = 'SpeechTruncatedError';

  constructor(
    /** The `since` of the read. */
    readonly since: number,
    readonly entries: SpeechEntry[],
  ) {
    super(
      `Speech after seq ${since} is incomplete: ${TRUNCATED_HINT}. ` +
        'Pass allowTruncated: true to read what is left.',
    );
  }
}

/** Why a wait or recording may have missed speech, and what to do about it. */
export const TRUNCATED_HINT =
  "some speech was dropped because the bridge's buffer was full (raise buffer.maxEntries)";

/** `waitForReady` timed out: the bridge was not reachable or not `ready` in time. */
export class BridgeNotReadyError extends Error {
  override name = 'BridgeNotReadyError';
}

/** The bridge speaks another major version of the HTTP API (docs/usage/http-api.md#versioning). */
export class IncompatibleBridgeError extends Error {
  override name = 'IncompatibleBridgeError';

  constructor(
    /** `bridge.apiVersion` reported by the bridge. */
    readonly bridgeApiVersion: string,
    /** The API version this client was built for. */
    readonly clientApiVersion: string,
  ) {
    super(
      `The bridge speaks API ${bridgeApiVersion}, this client needs API ${clientApiVersion}. ` +
        'Install the bridge and the client in the same version.',
    );
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

/**
 * `BridgeHttpError.code` when the bridge's answer doesn't match the API contract: a wrong
 * version, a proxy, a bug. Asking again won't help.
 */
export const INVALID_RESPONSE = 'INVALID_RESPONSE';

/** The bridge answered with an error (docs/usage/http-api.md#errors). */
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
