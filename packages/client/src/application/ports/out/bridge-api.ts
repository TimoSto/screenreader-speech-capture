import type { BridgeStatus } from '../../../domain/bridge-status.js';
import type { SpeechFeedEvent } from '../../../domain/feed-event.js';
import type { SessionList, SessionRef, StartedSession } from '../../../domain/session.js';
import type {
  FocusedWindow,
  FocusTarget,
  MouseButton,
  ScreenPoint,
} from '../../../domain/native-input.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';

/** One page of `GET /api/v1/speech`. */
export interface SpeechPage {
  entries: SpeechEntry[];
  /** Entries after `since` were dropped because the bridge's buffer was full. */
  truncated: boolean;
  /** More entries follow: ask again with the last entry's `seq` as `since`. */
  hasMore: boolean;
}

/** How the bridge records the speech an input causes (the `capture` of an input request). */
export interface CaptureRequest {
  quietForMs?: number | undefined;
  firstWithinMs?: number | undefined;
  timeoutMs?: number | undefined;
  settleMs?: number | undefined;
}

/** The answer of an input request with `capture` (API 1.19). */
export interface InputCapture {
  status: 'silent' | 'no-speech' | 'timeout';
  /** The newest `seq` right before the input. */
  startSeq: number;
  /** The speech after `startSeq` (no markers), oldest first: the first ones if `omitted`. */
  entries: SpeechEntry[];
  /** Later speech entries the bridge left out. */
  omitted: number;
  /** Entries after `startSeq` were dropped because the bridge's buffer was full. */
  truncated: boolean;
}

/**
 * What one connection to the live feed delivers: the feed events, plus `position` first on a
 * connection without `lastEventId` (API 1.12): the `seq` of the newest entry the bridge had
 * recorded, from where a reconnect picks up if no entry came before the connection dropped.
 */
export type StreamEvent = SpeechFeedEvent | { type: 'position'; seq: number };

/**
 * The bridge's HTTP API (driven port). Rejects with `BridgeUnreachableError` or
 * `BridgeHttpError` (domain/errors.ts).
 */
export interface BridgeApi {
  status(): Promise<BridgeStatus>;
  /** Entries and markers with `seq > since`, oldest first; with `session`, only its entries. */
  listSpeech(query: { since: number; limit?: number; session?: SessionRef }): Promise<SpeechPage>;
  /**
   * `DELETE /api/v1/speech`: wipes everything. With `session` (API 1.17), only the entries and
   * markers of the current session (its id or `current`) or of `none`; the session keeps running.
   */
  clear(session?: SessionRef | 'none'): Promise<void>;
  mark(label: string): Promise<SpeechEntry>;
  /**
   * `GET /api/v1/markers/latest` (API 1.20): the newest marker with this label, in `session`'s
   * scope (all entries without it), `null` if there is none.
   */
  latestMarker(label: string, session?: SessionRef): Promise<SpeechEntry | null>;
  /** `POST /api/v1/sessions` (API 1.3): the new session is current, the previous one ends. */
  startSession(request: { name: string; run?: string | undefined }): Promise<StartedSession>;
  /** `POST /api/v1/sessions/end` (API 1.3). */
  endSession(): Promise<void>;
  /** Deletes an ended session and its speech (API 1.16). */
  deleteSession(id: number): Promise<void>;
  /** `GET /api/v1/sessions` (API 1.3). */
  listSessions(): Promise<SessionList>;
  /** `POST /api/v1/input/click` (API 1.14): a native click. */
  click(request: ScreenPoint & { button?: MouseButton | undefined }): Promise<void>;
  /** `POST /api/v1/input/keys` (API 1.14). */
  pressKeys(request: {
    keys: string | readonly string[];
    delayMs?: number | undefined;
  }): Promise<void>;
  /**
   * `POST /api/v1/input/focus` (API 1.21): brings a window of a browser the bridge started to the
   * front; with `title`, one whose title contains it.
   */
  focusWindow(request: { target: FocusTarget; title?: string | undefined }): Promise<FocusedWindow>;
  /** `POST /api/v1/input/click` with `capture` (API 1.19): the click and the speech it caused. */
  captureClick(
    request: ScreenPoint & { button?: MouseButton | undefined; capture: CaptureRequest },
  ): Promise<InputCapture>;
  /** `POST /api/v1/input/keys` with `capture` (API 1.19): the keys and the speech they caused. */
  captureKeys(request: {
    keys: string | readonly string[];
    delayMs?: number | undefined;
    capture: CaptureRequest;
  }): Promise<InputCapture>;
  /**
   * One connection to the live feed (`GET /api/v1/speech/stream`). With `lastEventId` the bridge
   * first replays the buffered entries with `seq > lastEventId` (all of them, after a
   * `truncated`, if `lastEventId` is above every `seq` the bridge handed out). With `session` (API 1.3), only
   * that session's entries. The iterable ends or throws when the connection drops; `signal`
   * closes it.
   */
  streamSpeech(options: {
    lastEventId: number | null;
    session?: number | undefined;
    signal: AbortSignal;
  }): AsyncIterable<StreamEvent>;
}
