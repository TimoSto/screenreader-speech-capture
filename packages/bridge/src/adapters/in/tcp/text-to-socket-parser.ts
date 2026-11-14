import { TextDecoder } from 'node:util';

export interface ParserEvents {
  /** The connection's first line was a `voice=<id>` header. */
  header(voice: string): void;
  /** One complete, decoded, non-blank line. */
  line(text: string): void;
  /** A line was longer than `maxLineBytes` and was cut. */
  lineCut(maxLineBytes: number): void;
}

const LF = 0x0a;
const CR = 0x0d;
const HEADER = /^voice=(\S.*)$/;

/**
 * Parser for the `text-to-socket` wire format
 * (docs/implementation/tcp-capture.md#framing-and-decoding), one instance per connection. Bytes are
 * split at `\n` *before* decoding, so a multi-byte character split across two TCP packets is
 * decoded correctly.
 */
export class TextToSocketParser {
  private readonly decoder: TextDecoder;
  private pending: Uint8Array[] = [];
  private pendingBytes = 0;
  /** After a cut: drop bytes until the next `\n`. */
  private discarding = false;
  private firstLine = true;

  constructor(
    encoding: string,
    private readonly maxLineBytes: number,
    private readonly events: ParserEvents,
  ) {
    this.decoder = new TextDecoder(encoding);
  }

  push(chunk: Uint8Array): void {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(LF, start);
      const end = newline === -1 ? chunk.length : newline;
      this.append(chunk.subarray(start, end));
      if (newline === -1) return;
      this.completeLine();
      start = newline + 1;
    }
  }

  /** The connection closed: text still in the buffer becomes a last line. */
  end(): void {
    if (!this.discarding && this.pendingBytes > 0) this.emit();
    this.pending = [];
    this.pendingBytes = 0;
    this.discarding = false;
  }

  private append(bytes: Uint8Array): void {
    if (this.discarding || bytes.length === 0) return;
    const room = this.maxLineBytes - this.pendingBytes;
    if (bytes.length <= room) {
      this.pending.push(bytes);
      this.pendingBytes += bytes.length;
      return;
    }
    this.pending.push(bytes.subarray(0, room));
    this.pendingBytes += room;
    this.events.lineCut(this.maxLineBytes);
    this.emit();
    this.discarding = true;
  }

  private completeLine(): void {
    if (this.discarding) {
      this.discarding = false;
      return;
    }
    this.emit();
  }

  private emit(): void {
    let bytes = Buffer.concat(this.pending, this.pendingBytes);
    this.pending = [];
    this.pendingBytes = 0;
    if (bytes.at(-1) === CR) bytes = bytes.subarray(0, -1);

    const text = this.decoder.decode(bytes);
    const isFirst = this.firstLine;
    this.firstLine = false;

    const header = isFirst ? HEADER.exec(text) : null;
    if (header) {
      this.events.header(header[1]!.trim());
      return;
    }
    if (text.trim() === '') return;
    this.events.line(text);
  }
}
