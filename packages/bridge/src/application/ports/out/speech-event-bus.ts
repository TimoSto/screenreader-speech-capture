import type { SpeechEvent, SpeechListener } from '../../../domain/speech-event.js';

/**
 * In-process notifications about new entries, clears and sessions (SSE, `wait`, transcript).
 *
 * The contract `followLog` relies on for "nothing missed or sent twice" (with `SeqCursor`):
 * - every event published after `subscribe` returns reaches the listener, in publish order;
 * - nothing reaches it after its unsubscribe function was called.
 *
 * Delivery may happen at once or later: a synchronous bus is allowed, not required.
 */
export interface SpeechEventBus {
  publish(event: SpeechEvent): void;
  /** Returns a function that removes the listener. */
  subscribe(listener: SpeechListener): () => void;
}
