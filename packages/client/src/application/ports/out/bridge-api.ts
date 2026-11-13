import type { BridgeStatus } from '../../../domain/bridge-status.js';
import type { SpeechFeedEvent } from '../../../domain/feed-event.js';
import type { Session, SessionList, SessionRef } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';

/** One page of `GET /api/v1/speech`. */
export interface SpeechPage {
  entries: SpeechEntry[];
  /** Entries after `since` were dropped because the bridge's buffer was full. */
  truncated: boolean;
  /** More entries follow: ask again with the last entry's `seq` as `since`. */
  hasMore: boolean;
}

/**
 * The bridge's HTTP API (driven port). Rejects with `BridgeUnreachableError` or
 * `BridgeHttpError` (domain/errors.ts).
 */
export interface BridgeApi {
  status(): Promise<BridgeStatus>;
  /** Entries and markers with `seq > since`, oldest first; with `session`, only its entries. */
  listSpeech(query: { since: number; limit?: number; session?: SessionRef }): Promise<SpeechPage>;
  clear(): Promise<void>;
  mark(label: string): Promise<SpeechEntry>;
  /** `POST /api/v1/sessions` (API 1.3): the new session is current, the previous one ends. */
  startSession(request: { name: string; run?: string | undefined }): Promise<Session>;
  /** `POST /api/v1/sessions/end` (API 1.3). */
  endSession(): Promise<void>;
  /** `GET /api/v1/sessions` (API 1.3). */
  listSessions(): Promise<SessionList>;
  /**
   * One connection to the live feed (`GET /api/v1/speech/stream`). With `lastEventId` the bridge
   * first replays the buffered entries with `seq > lastEventId`. The iterable ends or throws when
   * the connection drops; `signal` closes it.
   */
  streamSpeech(options: {
    lastEventId: number | null;
    signal: AbortSignal;
  }): AsyncIterable<SpeechFeedEvent>;
}
