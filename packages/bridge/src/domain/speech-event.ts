import type { SessionSummary } from './session.js';
import type { SpeechEntry } from './speech-entry.js';

/** A new entry in the buffer, the buffer was cleared, or a session started or ended. */
export type SpeechEvent =
  | { type: 'entry'; entry: SpeechEntry }
  | { type: 'clear' }
  | { type: 'session'; session: SessionSummary };

export type SpeechListener = (event: SpeechEvent) => void;
