import type { SessionSummary } from './session.js';
import type { SpeechEntry } from './speech-entry.js';

/** A new entry in the buffer, the buffer (or one scope of it) was cleared, or a session started or ended. */
export type SpeechEvent =
  | { type: 'entry'; entry: SpeechEntry }
  /** `sessionId` set: only that scope was cleared (`null`: the entries outside sessions). */
  | { type: 'clear'; sessionId?: number | null }
  | { type: 'session'; session: SessionSummary };

export type SpeechListener = (event: SpeechEvent) => void;
