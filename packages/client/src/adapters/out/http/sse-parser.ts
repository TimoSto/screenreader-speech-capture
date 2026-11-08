/** One Server-Sent Events message. */
export interface SseMessage {
  /** The `id` field of this message, `undefined` if it had none. */
  id: string | undefined;
  /** The `event` field, `'message'` if it had none. */
  event: string;
  /** The `data` lines, joined with `\n`. */
  data: string;
}

/**
 * Parses a `text/event-stream` body, already decoded to text, into messages (the event stream
 * format of the HTML standard): lines end with LF, CRLF or CR, `:` starts a comment (the
 * bridge's ping), a blank line ends a message, and a message without `data` is skipped. A
 * message that is not ended by a blank line when the stream ends is dropped, as the standard
 * says.
 */
export async function* parseSse(chunks: AsyncIterable<string>): AsyncGenerator<SseMessage> {
  let rest = '';
  let first = true;
  let skipLf = false;
  let id: string | undefined;
  let event = '';
  let data: string[] = [];

  for await (let chunk of chunks) {
    if (first && chunk.length > 0) {
      first = false;
      if (chunk.startsWith('﻿')) chunk = chunk.slice(1);
    }
    // A CR at the end of the last chunk may be the first half of a CRLF.
    if (skipLf && chunk.startsWith('\n')) chunk = chunk.slice(1);
    skipLf = false;
    rest += chunk;

    let start = 0;
    for (;;) {
      const end = rest.slice(start).search(/[\r\n]/);
      if (end === -1) break;
      const at = start + end;
      const line = rest.slice(start, at);
      if (rest[at] === '\r' && rest[at + 1] === '\n') {
        start = at + 2;
      } else {
        start = at + 1;
        if (rest[at] === '\r' && start === rest.length) skipLf = true;
      }

      if (line === '') {
        if (data.length > 0) yield { id, event: event || 'message', data: data.join('\n') };
        id = undefined;
        event = '';
        data = [];
        continue;
      }
      if (line.startsWith(':')) continue;
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
      if (field === 'data') data.push(value);
      else if (field === 'event') event = value;
      else if (field === 'id' && !value.includes('\0')) id = value;
      // `retry` and unknown fields: ignored, the client has its own reconnect policy.
    }
    rest = rest.slice(start);
  }
}
