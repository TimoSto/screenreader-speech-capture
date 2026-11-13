import type { BridgeEventDto } from '@screenreader-speech-capture/shared';
import type { WatchEvent } from '../../../../application/ports/in/watch-speech.js';
import { toSessionDto } from '../dto/session.js';
import { toSpeechEntryDto } from '../dto/speech.js';

/**
 * The `bridge` frame, first on every stream (before a replay), so a client can tell that its
 * `Last-Event-ID` came from an earlier bridge run. No `id:`, like the `session` frame.
 */
export function bridgeFrame(instanceId: string): string {
  const data: BridgeEventDto = { instanceId };
  return `event: bridge\ndata: ${JSON.stringify(data)}\n\n`;
}

/** The SSE frame for one event (docs/http-api.md, `GET /speech/stream`). */
export function sseFrame(event: WatchEvent): string {
  switch (event.type) {
    case 'entry': {
      const data = JSON.stringify(toSpeechEntryDto(event.entry));
      return `id: ${event.entry.seq}\nevent: entry\ndata: ${data}\n\n`;
    }
    // No `id:`, so `Last-Event-ID` stays the seq of the last entry.
    case 'session':
      return `event: session\ndata: ${JSON.stringify(toSessionDto(event.session))}\n\n`;
    default:
      return `event: ${event.type}\ndata: {}\n\n`;
  }
}
