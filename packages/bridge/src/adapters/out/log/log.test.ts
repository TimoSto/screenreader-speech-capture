import { describe, expect, it } from 'vitest';
import { BridgeLog, formatLogLines, PREFIX_WIDTH, wantsColour, type LogSink } from './log.js';

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

describe('wantsColour', () => {
  it('uses colours on a terminal only', () => {
    expect(wantsColour(true, {})).toBe(true);
    expect(wantsColour(false, {})).toBe(false);
    expect(wantsColour(undefined, {})).toBe(false);
  });

  it('honours NO_COLOR and FORCE_COLOR', () => {
    expect(wantsColour(true, { NO_COLOR: '1' })).toBe(false);
    expect(wantsColour(false, { FORCE_COLOR: '1' })).toBe(true);
    expect(wantsColour(false, { FORCE_COLOR: '0' })).toBe(false);
    expect(wantsColour(false, { FORCE_COLOR: '1', NO_COLOR: '1' })).toBe(false);
  });
});

describe('BridgeLog', () => {
  it('filters by level and writes to every sink in its own colour mode', () => {
    const plain: string[] = [];
    const coloured: string[] = [];
    const sinks: LogSink[] = [
      { colour: false, write: (l) => plain.push(l) },
      { colour: true, write: (l) => coloured.push(l) },
    ];
    const log = new BridgeLog('info', sinks, () => time);
    const logger = log.for('config');
    logger.debug('hidden');
    logger.info('shown');
    log.setLevel('debug');
    logger.debug('now shown');
    expect(plain).toEqual([
      '[config]            2026-11-07T14:03:10.002Z INFO  shown',
      '[config]            2026-11-07T14:03:10.002Z DEBUG now shown',
    ]);
    expect(coloured).toHaveLength(2);
    expect(coloured[0]).toContain('\u001b[90m[config]\u001b[0m');
  });

  it('writes always() lines at every level', () => {
    const lines: string[] = [];
    const log = new BridgeLog(
      'error',
      [{ colour: false, write: (l) => lines.push(l) }],
      () => time,
    );
    log.for('bridge').info('hidden');
    log.always('bridge', 'starting');
    expect(lines).toEqual(['[bridge]            2026-11-07T14:03:10.002Z INFO  starting']);
  });
});
