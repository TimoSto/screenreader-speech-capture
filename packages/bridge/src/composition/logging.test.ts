import { describe, expect, it } from 'vitest';
import type { LogSink } from '../adapters/out/log/bridge-log.js';
import { DEFAULT_CONFIG, mergeConfig, type ConfigPatch } from '../domain/config/index.js';
import { createLogging } from './logging.js';

function sink(): LogSink & { lines: string[] } {
  const lines: string[] = [];
  return { colour: false, speech: true, lines, write: (line) => void lines.push(line) };
}
const config = (patch: ConfigPatch = {}) => mergeConfig(DEFAULT_CONFIG, patch);
/** The message part of a log line, after prefix, time and level. */
const message = (line: string) => line.replace(/^\[\S+\]\s+\S+ \S+\s+/, '');

describe('createLogging', () => {
  it('always writes the startup line, whatever the level', () => {
    const out = sink();
    createLogging(config({ log: { level: 'error' } }), {
      version: '1.2.3',
      configLocation: '/cfg.json',
      sinks: [out],
    });
    expect(out.lines.map(message)).toEqual([
      'starting, version 1.2.3, config /cfg.json, log level error (speech text is logged at debug)',
    ]);
  });

  it.each([
    [{ consoleSpeech: true }, '(speech text also on the console)'],
    [{ consoleSpeech: false }, '(speech text is not shown: no log file)'],
  ])('at debug, says where the speech text goes (%j)', (log, hint) => {
    const out = sink();
    createLogging(config({ log: { level: 'debug', ...log } }), {
      version: '1',
      configLocation: 'c',
      sinks: [out],
    });
    expect(message(out.lines[0]!)).toBe(`starting, version 1, config c, log level debug ${hint}`);
  });

  it('apply() changes the level', () => {
    const out = sink();
    const before = config();
    const logging = createLogging(before, {
      version: '1',
      configLocation: 'c',
      sinks: [out],
    });
    const logger = logging.log.for('bridge');
    logger.debug('hidden');
    logging.apply(config({ log: { level: 'debug' } }), before);
    logger.debug('shown');
    expect(out.lines.map(message).slice(1)).toEqual(['shown']);
  });
});
