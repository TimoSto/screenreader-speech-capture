import type { Logger } from '../ports/out/logger.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';

export interface TranscriptServiceDeps {
  events: SpeechEventBus;
  /**
   * Where the lines go. Should be a logger on the `speech` channel, so the text stays off the
   * console by default (docs/operations.md#logging).
   */
  transcript: Logger;
}

/** Logs each recorded speech line, and each session start and end, at `debug`. */
export class TranscriptService {
  constructor(private readonly deps: TranscriptServiceDeps) {}

  /** Starts logging. Returns a function that stops it. */
  start(): () => void {
    const { events, transcript } = this.deps;
    return events.subscribe((event) => {
      if (event.type === 'session') {
        const { id, name, endedAt } = event.session;
        transcript.debug(
          endedAt === null ? `session ${id} started: ${name}` : `session ${id} ended`,
        );
        return;
      }
      if (event.type !== 'entry' || event.entry.kind !== 'speech') return;
      const { seq, connectionId, text } = event.entry;
      transcript.debug(`#${seq} (connection ${connectionId}) ${text}`);
    });
  }
}
