import { describe, expect, it } from 'vitest';
import { BridgeLog, type LogSink } from './bridge-log.js';

const time = new Date('2026-11-07T14:03:10.002Z');

describe('BridgeLog', () => {
  it('filters by level and writes to every sink in its own colour mode', () => {
    const plain: string[] = [];
    const coloured: string[] = [];
    const sinks: LogSink[] = [
      { colour: false, speech: false, write: (l) => plain.push(l) },
      { colour: true, speech: false, write: (l) => coloured.push(l) },
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
      [{ colour: false, speech: false, write: (l) => lines.push(l) }],
      () => time,
    );
    log.for('bridge').info('hidden');
    log.always('bridge', 'starting');
    expect(lines).toEqual(['[bridge]            2026-11-07T14:03:10.002Z INFO  starting']);
  });

  it('writes the speech channel only to sinks that accept it, still filtered by level', () => {
    const console: string[] = [];
    const file: string[] = [];
    const log = new BridgeLog(
      'info',
      [
        { colour: false, speech: false, write: (l) => console.push(l) },
        { colour: false, speech: true, write: (l) => file.push(l) },
      ],
      () => time,
    );
    const transcript = log.for('speech-capture', { channel: 'speech' });
    transcript.debug('below the level');
    log.setLevel('debug');
    transcript.debug('#1 (connection 1) Hello');
    log.for('speech-capture').info('connection 1 opened');

    expect(console).toEqual([
      '[speech-capture]    2026-11-07T14:03:10.002Z INFO  connection 1 opened',
    ]);
    expect(file).toEqual([
      '[speech-capture]    2026-11-07T14:03:10.002Z DEBUG #1 (connection 1) Hello',
      '[speech-capture]    2026-11-07T14:03:10.002Z INFO  connection 1 opened',
    ]);
  });
});
