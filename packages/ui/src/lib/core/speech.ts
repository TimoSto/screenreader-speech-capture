import type { SessionDto, SpeechEntryDto } from '@screenreader-speech-capture/shared';
import type { SessionScope } from './sessions.js';

/** The table keeps this many rows; the oldest go first (the bridge's own buffer is capped too). */
export const MAX_ROWS = 5000;

/**
 * `connecting`/`live`/`reconnecting`: a stream. `ended`: an ended session was read in full and
 * nothing more will arrive. `failed`: it could not be read.
 */
export type FeedState = 'connecting' | 'live' | 'reconnecting' | 'ended' | 'failed';

export type SpeechFeedHandlers = {
  onEntry(entry: SpeechEntryDto): void;
  /** Entries read in one go (the pages of an ended session), oldest first. */
  onEntries(entries: readonly SpeechEntryDto[]): void;
  /** The bridge wiped its buffer. */
  onClear(): void;
  onState(state: FeedState): void;
};

/** The speech of one scope (the adapter streams a live one and reads an ended one once). */
export interface SpeechFeed {
  /**
   * Starts the feed; the returned function stops it. A `live` scope (the current session, or the
   * speech outside any session) replays what is in the buffer and then follows; an ended session
   * only has what is in the buffer.
   */
  open(scope: SessionScope, live: boolean, handlers: SpeechFeedHandlers): () => void;
}

/** Whether new speech can still arrive in `scope`. */
export function isLiveScope(scope: SessionScope, currentId: number | null): boolean {
  return scope === 'none' || scope === currentId;
}

/** `14:03:07.042` in the browser's time zone. */
export function formatReceivedTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const two = (value: number) => String(value).padStart(2, '0');
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}.${millis}`;
}

/** `#3 Checkout flow`, or what the log shows when no session is selected. */
export function logHeading(scope: SessionScope, sessions: readonly SessionDto[]): string {
  if (scope === 'none') return 'Outside sessions';
  const session = sessions.find((candidate) => candidate.id === scope);
  return session === undefined ? `#${scope}` : `#${session.id} ${session.name}`;
}
