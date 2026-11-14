import type { BridgeStatus } from '../../../domain/bridge-status.js';
import type { Session, SessionList, SessionRef, StartedSession } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import type { SpeechMatch } from '../../../domain/text-match.js';

export interface GetSpeechOptions {
  /** Only entries with `seq > since`. Default: the cursor. */
  since?: number | undefined;
  /** At most this many entries (the oldest ones). */
  limit?: number | undefined;
  /** Include markers. Default `false`. */
  includeMarkers?: boolean | undefined;
  /**
   * Only entries of this session: its `id`, or `'current'` (the session current when the request
   * arrives). Default: all entries.
   */
  session?: SessionRef | undefined;
}

export interface GetTextOptions {
  /** Only speech with `seq > since`. Default: the cursor. */
  since?: number | undefined;
  /** Between two entries. Default `'\n'`. */
  separator?: string | undefined;
  /**
   * Only entries of this session: its `id`, or `'current'` (the session current when the request
   * arrives). Default: all entries.
   */
  session?: SessionRef | undefined;
}

export interface WaitOptions {
  /** Milliseconds. Default 5000. */
  timeout?: number | undefined;
  /** Search entries with `seq > since`. Default: the cursor. */
  since?: number | undefined;
  /** Ignore case and extra whitespace (strings and regular expressions). */
  normalize?: boolean | undefined;
  /**
   * Only entries of this session: its `id`, or `'current'` (the session current when the wait
   * starts; it stays that one even if another session starts meanwhile). Default: all entries.
   */
  session?: SessionRef | undefined;
}

export interface StartSessionOptions {
  /** Label that groups sessions, for example one per test run. */
  run?: string | undefined;
}

export interface SilenceOptions {
  /** Milliseconds without new speech. Default 500. */
  quietFor?: number | undefined;
  /** Milliseconds. Default 10000. */
  timeout?: number | undefined;
}

export interface ReadyOptions {
  /** Milliseconds. Default 120000. */
  timeout?: number | undefined;
}

export interface OnSpeechOptions {
  /**
   * First replay the buffered entries with `seq > since`, then go on live. Default: only entries
   * that arrive after subscribing.
   */
  since?: number | undefined;
  /** Also deliver markers. Default `false`. */
  includeMarkers?: boolean | undefined;
  /** A session started or ended (`endedAt` is set when it ended). */
  onSession?: ((session: Session) => void) | undefined;
  /** The bridge's buffer was cleared. */
  onClear?: (() => void) | undefined;
  /** Some entries of a replay were already dropped because the bridge's buffer was full. */
  onTruncated?: (() => void) | undefined;
  /**
   * A problem with the feed. With `retrying: true` the feed goes on: it reconnects by itself
   * (a lost connection) or the error came from one of the callbacks. With `retrying: false` it
   * has stopped for good (`IncompatibleBridgeError`, an HTTP `4xx`, an invalid bridge URL).
   */
  onError?: ((error: Error, info: { retrying: boolean }) => void) | undefined;
}

export interface Recording<T> {
  result: T;
  /** Speech spoken while `fn` ran and until silence, oldest first. */
  entries: SpeechEntry[];
}

/**
 * The library's functions (docs/client.md#library). The CLI and the Playwright fixture are built
 * on the same interface.
 *
 * Every client keeps a **cursor**: the `seq` of the last entry it consumed, used as the default
 * `since` (docs/client.md#the-cursor). The first call checks the bridge's API version and rejects
 * with `IncompatibleBridgeError` if the major version differs.
 */
export interface SpeechCapture {
  /** Recorded speech after the cursor (or `since`), oldest first. */
  getSpeech(options?: GetSpeechOptions): Promise<SpeechEntry[]>;
  /** All speech after the cursor (or `since`), joined into one string. */
  getText(options?: GetTextOptions): Promise<string>;
  /** Clears the bridge's buffer (all sessions) and resets the cursor. For manual use. */
  clear(): Promise<void>;
  /**
   * Starts a session (docs/speech-capture.md#sessions): it becomes current and the previous one
   * ends. Moves the cursor to the session's start, so the next reads and waits only see its
   * speech. `replaced` is the session of another client it ended, if any: a sign that two
   * clients share the screen reader.
   */
  startSession(name: string, options?: StartSessionOptions): Promise<StartedSession>;
  /** Ends the current session. Speech after this belongs to no session. */
  endSession(): Promise<void>;
  /** The sessions still in the buffer plus the current one, newest first. */
  sessions(): Promise<SessionList>;
  /** Inserts a marker. Its `seq` can be used as `since`. */
  mark(label: string): Promise<SpeechEntry>;
  /** Bridge health and versions. */
  status(): Promise<BridgeStatus>;
  /**
   * Waits until the bridge answers and is `ready`. Rejects with `BridgeNotReadyError` on timeout.
   */
  waitForReady(options?: ReadyOptions): Promise<BridgeStatus>;
  /**
   * Waits until a speech entry after the cursor (or `since`) matches, then moves the cursor to
   * it. Speech that arrived before the call is found too. Rejects with `SpeechTimeoutError`.
   */
  waitForOutput(match: SpeechMatch, options?: WaitOptions): Promise<SpeechEntry>;
  /**
   * Waits until the matches occur in this order (other entries may come in between), then moves
   * the cursor to the last match. Rejects with `SpeechTimeoutError`.
   */
  waitForSequence(matches: readonly SpeechMatch[], options?: WaitOptions): Promise<SpeechEntry[]>;
  /**
   * Waits until no new speech has arrived for `quietFor` ms, counted from the call. Rejects with
   * `SpeechTimeoutError` if speech goes on until the timeout.
   */
  waitForSilence(options?: SilenceOptions): Promise<void>;
  /**
   * Runs `fn` and returns the speech spoken while it ran (waits for silence at the end), then
   * moves the cursor to the end.
   */
  record<T>(fn: () => T | Promise<T>, options?: SilenceOptions): Promise<Recording<T>>;
  /**
   * Subscribes to the live feed (SSE): `listener` gets every new speech entry as the bridge
   * receives it, until the returned function is called. Reconnects by itself after a lost
   * connection, without losing or repeating entries. Does not move the cursor.
   */
  onSpeech(listener: (entry: SpeechEntry) => void, options?: OnSpeechOptions): () => void;
  /** The cursor: the `seq` of the last entry consumed. */
  cursor(): number;
  /** Sets the cursor, for example to a marker's `seq`. */
  setCursor(seq: number): void;
}
