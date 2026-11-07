import type { SpeechEntry } from '../../../domain/speech-entry.js';

export type SpeechEvent = { type: 'entry'; entry: SpeechEntry } | { type: 'clear' };

export type SpeechListener = (event: SpeechEvent) => void;

/** In-process notifications about new entries and clears (SSE, `wait`, UI). */
export interface SpeechEventBus {
  publish(event: SpeechEvent): void;
  /** Returns a function that removes the listener. */
  subscribe(listener: SpeechListener): () => void;
}
