import type { SpeechEntry } from './speech-entry.js';

/** A new entry in the buffer, or the buffer was cleared. */
export type SpeechEvent = { type: 'entry'; entry: SpeechEntry } | { type: 'clear' };

export type SpeechListener = (event: SpeechEvent) => void;
