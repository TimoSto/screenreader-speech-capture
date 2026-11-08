import type { BridgeStatus, SpeechEntry, SpeechFeedEvent } from '../../../domain/speech-entry.js';

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
  /** Entries and markers with `seq > since`, oldest first. */
  listSpeech(query: { since: number; limit?: number }): Promise<SpeechPage>;
  clear(): Promise<void>;
  mark(label: string): Promise<SpeechEntry>;
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
