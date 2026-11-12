import type { Logger } from '../../../application/ports/out/logger.js';
import type { SpeechEventBus } from '../../../application/ports/out/speech-event-bus.js';

/**
 * Writes each recorded speech line, and each session start and end, to `transcript`, which should be a logger on the `speech`
 * channel, so the text stays off the console by default (docs/operations.md#logging).
 * Returns a function that stops it.
 */
export function logSpeechTranscript(events: SpeechEventBus, transcript: Logger): () => void {
  return events.subscribe((event) => {
    if (event.type === 'session') {
      const { id, name, endedAt } = event.session;
      transcript.debug(endedAt === null ? `session ${id} started: ${name}` : `session ${id} ended`);
      return;
    }
    if (event.type !== 'entry' || event.entry.kind !== 'speech') return;
    const { seq, connectionId, text } = event.entry;
    transcript.debug(`#${seq} (connection ${connectionId}) ${text}`);
  });
}
