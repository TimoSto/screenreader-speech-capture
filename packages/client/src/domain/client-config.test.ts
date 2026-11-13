import { describe, expect, it } from 'vitest';
import { parseClientConfig, parseConfigKey } from './client-config.js';
import { ClientConfigError } from './errors.js';

describe('parseClientConfig', () => {
  it('accepts an empty object and normalises the url', () => {
    expect(parseClientConfig({}, 'f')).toEqual({});
    expect(parseClientConfig({ url: 'http://vm:1/', other: true }, 'f')).toEqual({
      url: 'http://vm:1',
    });
  });

  it.each([
    ['a non-object', []],
    ['null', null],
    ['a non-string url', { url: 5 }],
    ['an invalid url', { url: 'vm:5151' }],
  ])('rejects %s and names the origin', (_name, raw) => {
    expect(() => parseClientConfig(raw, '/cfg/client.json')).toThrow(/\/cfg\/client\.json/);
  });
});

describe('parseConfigKey', () => {
  it('accepts known keys and rejects others', () => {
    expect(parseConfigKey('url')).toBe('url');
    expect(() => parseConfigKey('colour')).toThrow(ClientConfigError);
    expect(() => parseConfigKey('toString')).toThrow(ClientConfigError);
  });
});
