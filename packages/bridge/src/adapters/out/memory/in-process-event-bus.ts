import type {
  SpeechEvent,
  SpeechEventBus,
  SpeechListener,
} from '../../../application/ports/out/speech-event-bus.js';

/** Synchronous in-process event bus. A failing listener doesn't stop the others. */
export class InProcessEventBus implements SpeechEventBus {
  private readonly listeners = new Set<SpeechListener>();

  constructor(private readonly onListenerError: (error: unknown) => void = () => {}) {}

  publish(event: SpeechEvent): void {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }

  subscribe(listener: SpeechListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
