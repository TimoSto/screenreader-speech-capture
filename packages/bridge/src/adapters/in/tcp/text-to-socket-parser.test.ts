import { describe, expect, it } from 'vitest';
import { TextToSocketParser } from './text-to-socket-parser.js';

function setup(encoding = 'utf-8', maxLineBytes = 1024) {
  const out: string[] = [];
  const parser = new TextToSocketParser(encoding, maxLineBytes, {
    header: (voice) => out.push(`header:${voice}`),
    line: (text) => out.push(text),
    lineCut: (max) => out.push(`cut:${max}`),
  });
  const push = (...chunks: (string | number[])[]) => {
    for (const chunk of chunks) {
      parser.push(typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : Uint8Array.from(chunk));
    }
  };
  return { out, parser, push };
}

describe('TextToSocketParser', () => {
  it('splits CRLF and LF lines', () => {
    const { out, push } = setup();
    push('Submit, button\r\nEdit, Name\nLast\r\n');
    expect(out).toEqual(['Submit, button', 'Edit, Name', 'Last']);
  });

  it('joins lines that arrive in several chunks, also between \\r and \\n', () => {
    const { out, push } = setup();
    push('Sub', 'mit\r', '\nNext\r\n');
    expect(out).toEqual(['Submit', 'Next']);
  });

  it('decodes a UTF-8 character that is split across two chunks', () => {
    const { out, push } = setup('utf-8');
    const bytes = [...Buffer.from('Grüße\r\n', 'utf8')];
    // "ü" is 0xC3 0xBC: cut between its two bytes
    push(bytes.slice(0, 3), bytes.slice(3));
    expect(out).toEqual(['Grüße']);
  });

  it('decodes windows-1252', () => {
    const { out, push } = setup('windows-1252');
    push([0x4d, 0xe4, 0x72, 0x7a, 0x20, 0x80, 0x0d, 0x0a]);
    expect(out).toEqual(['März €']);
  });

  it('takes a voice=<id> first line as the header', () => {
    const { out, push } = setup();
    push('voice=ssc5000\r\nHello\r\n');
    expect(out).toEqual(['header:ssc5000', 'Hello']);
  });

  it('only takes the first line as the header', () => {
    const { out, push } = setup();
    push('Hello\r\nvoice=later\r\n');
    expect(out).toEqual(['Hello', 'voice=later']);
  });

  it('skips empty and whitespace-only lines', () => {
    const { out, push } = setup();
    push('\r\n   \r\nText\r\n\t\r\n');
    expect(out).toEqual(['Text']);
  });

  it('cuts long lines and drops the rest up to the next newline', () => {
    const { out, push } = setup('utf-8', 8);
    push('0123456789abc', 'def\r\nnext\r\n');
    expect(out).toEqual(['cut:8', '01234567', 'next']);
  });

  it('records text left in the buffer when the connection ends', () => {
    const { out, parser, push } = setup();
    push('Done\r\nno newline');
    parser.end();
    expect(out).toEqual(['Done', 'no newline']);
  });
});
