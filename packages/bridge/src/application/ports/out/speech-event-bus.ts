import type { SpeechEvent, SpeechListener } from '../../../domain/speech-event.js';

/** In-process notifications about new entries and clears (SSE, `wait`, UI). */
export interface SpeechEventBus {
  publish(event: SpeechEvent): void;
  /** Returns a function that removes the listener. */
  subscribe(listener: SpeechListener): () => void;
}
