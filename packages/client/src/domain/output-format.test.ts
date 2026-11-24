import { describe, expect, it } from 'vitest';
import { pickValue } from './config-value.js';
import { ClientConfigError } from './errors.js';
import { OUTPUT_SETTING, parseOutputFormat } from './output-format.js';

describe('parseOutputFormat', () => {
  it('accepts text and json in any case', () => {
    expect(parseOutputFormat(' JSON ')).toBe('json');
    expect(parseOutputFormat('text')).toBe('text');
  });

  it.each(['', 'yaml', 'jsonl'])('rejects "%s"', (input) => {
    expect(() => parseOutputFormat(input)).toThrow(ClientConfigError);
  });
});

describe('pickValue for the output format', () => {
  it('prefers --json, then SR_SPEECH_OUTPUT, then the config file, then text', () => {
    const all = { explicit: 'json', env: 'text', stored: 'json' };
    expect(pickValue(OUTPUT_SETTING, all)).toEqual({ value: 'json', source: 'explicit' });
    expect(pickValue(OUTPUT_SETTING, { ...all, explicit: undefined })).toEqual({
      value: 'text',
      source: 'env',
    });
    expect(pickValue(OUTPUT_SETTING, { stored: 'json' })).toEqual({
      value: 'json',
      source: 'config',
    });
    expect(pickValue(OUTPUT_SETTING, {})).toEqual({ value: 'text', source: 'default' });
  });

  it('names SR_SPEECH_OUTPUT when it is invalid', () => {
    expect(() => pickValue(OUTPUT_SETTING, { env: 'xml' })).toThrow(/SR_SPEECH_OUTPUT "xml"/);
  });
});
