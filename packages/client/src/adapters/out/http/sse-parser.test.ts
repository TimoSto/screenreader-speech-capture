import { describe, expect, it } from 'vitest';
import { parseSse, type SseMessage } from './sse-parser.js';

async function parse(...chunks: string[]): Promise<SseMessage[]> {
  async function* source() {
    for (const chunk of chunks) {
      await Promise.resolve();
      yield chunk;
    }
  }
  const messages: SseMessage[] = [];
  for await (const message of parseSse(source())) messages.push(message);
  return messages;
}

describe('parseSse', () => {
  it('parses the bridge frames and ignores pings', async () => {
    expect(
      await parse(': ping\n\nid: 7\nevent: entry\ndata: {"seq":7}\n\nevent: clear\ndata: {}\n\n'),
    ).toEqual([
      { id: '7', event: 'entry', data: '{"seq":7}' },
      { id: undefined, event: 'clear', data: '{}' },
    ]);
  });

  it('joins frames split across chunks anywhere', async () => {
    const text = 'id: 1\nevent: entry\ndata: {"a":1}\n\nid: 2\nevent: entry\ndata: {"a":2}\n\n';
    const whole = await parse(text);
    for (let i = 1; i < text.length; i++) {
      expect(await parse(text.slice(0, i), text.slice(i))).toEqual(whole);
    }
    expect(await parse(...text.split(''))).toEqual(whole);
  });

  it('accepts CRLF and CR line ends, also with CRLF split across chunks', async () => {
    const expected = [{ id: undefined, event: 'message', data: 'x' }];
    expect(await parse('data: x\r\n\r\n')).toEqual(expected);
    expect(await parse('data: x\r\r')).toEqual(expected);
    expect(await parse('data: x\r', '\n\r', '\n')).toEqual(expected);
    // Two CRs in a row are two line ends, so the message ends after the first `\r\r`.
    expect(await parse('data: x\r', '\r', 'data: y\n\n')).toEqual([
      ...expected,
      { id: undefined, event: 'message', data: 'y' },
    ]);
  });

  it('joins several data lines, keeps spaces after the first, strips a BOM', async () => {
    expect(await parse('﻿data: a\ndata:  b\ndata\n\n')).toEqual([
      { id: undefined, event: 'message', data: 'a\n b\n' },
    ]);
  });

  it('skips messages without data and drops an unfinished last message', async () => {
    expect(await parse('event: clear\n\nid: 3\n\ndata: half')).toEqual([]);
  });
});
