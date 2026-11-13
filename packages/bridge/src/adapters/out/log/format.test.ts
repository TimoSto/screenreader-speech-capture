import { describe, expect, it } from 'vitest';
import { formatLogLines, PREFIX_WIDTH } from './format.js';

const time = new Date('2026-11-07T14:03:10.002Z');

describe('formatLogLines', () => {
  it('pads every prefix to the same width', () => {
    expect(PREFIX_WIDTH).toBe(20);
    const [bridge] = formatLogLines('bridge', 'info', time, 'ready', false);
    const [server] = formatLogLines('playwright-server', 'error', time, 'boom', false);
    expect(bridge).toBe('[bridge]            2026-11-07T14:03:10.002Z INFO  ready');
    expect(server).toBe('[playwright-server] 2026-11-07T14:03:10.002Z ERROR boom');
  });

  it('writes each line of a multi-line message with the full prefix', () => {
    const lines = formatLogLines('http-api', 'warn', time, 'a\r\nb\nc', false);
    expect(lines).toEqual([
      '[http-api]          2026-11-07T14:03:10.002Z WARN  a',
      '[http-api]          2026-11-07T14:03:10.002Z WARN  b',
      '[http-api]          2026-11-07T14:03:10.002Z WARN  c',
    ]);
  });

  it('colours prefix and level only, and keeps the alignment', () => {
    const [line] = formatLogLines('speech-capture', 'error', time, 'msg', true);
    expect(line).toBe(
      '\u001b[32m[speech-capture]\u001b[0m    2026-11-07T14:03:10.002Z \u001b[31mERROR\u001b[0m msg',
    );
    // eslint-disable-next-line no-control-regex
    expect(line!.replace(/\u001b\[[\d;]*m/g, '')).toBe(
      formatLogLines('speech-capture', 'error', time, 'msg', false)[0],
    );
  });
});
