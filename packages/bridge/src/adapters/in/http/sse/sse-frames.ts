import type { WatchEvent } from '../../../../application/ports/in/speech.js';
import { toSessionDto } from '../dto/session.js';
import { toSpeechEntryDto } from '../dto/speech.js';

/**
 * Frames already built, by the entry or session they show. Every open stream gets the same
 * object from the event bus, so each is serialized once however many streams are open, and the
 * frame goes away with the entry.
 */
const frames = new WeakMap<object, string>();

function cached(key: object, build: () => string): string {
  let frame = frames.get(key);
  if (frame === undefined) {
    frame = build();
    frames.set(key, frame);
  }
  return frame;
}

/** The SSE frame for one event (docs/usage/http-api.md, `GET /speech/stream`). */
export function sseFrame(event: WatchEvent): string {
  switch (event.type) {
    case 'entry':
      return cached(event.entry, () => {
        const data = JSON.stringify(toSpeechEntryDto(event.entry));
        return `id: ${event.entry.seq}\nevent: entry\ndata: ${data}\n\n`;
      });
    // No `id:`, so `Last-Event-ID` stays the seq of the last entry.
    case 'session':
      return cached(
        event.session,
        () => `event: session\ndata: ${JSON.stringify(toSessionDto(event.session))}\n\n`,
      );
    default:
      return `event: ${event.type}\ndata: {}\n\n`;
  }
}
