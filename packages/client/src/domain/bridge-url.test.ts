import { describe, expect, it } from 'vitest';
import {
  ClientConfigError,
  DEFAULT_BRIDGE_URL,
  normalizeBridgeUrl,
  overridesStored,
  parseClientConfig,
  parseConfigKey,
  pickBridgeUrl,
} from './bridge-url.js';

describe('normalizeBridgeUrl', () => {
  it('strips trailing slashes and whitespace', () => {
    expect(normalizeBridgeUrl(' http://vm:5151/ ')).toBe('http://vm:5151');
    expect(normalizeBridgeUrl('https://host/prefix//')).toBe('https://host/prefix');
  });

  it.each(['vm:5151', 'ftp://vm', 'not a url', 'http://vm:5151/?a=1', 'http://vm#x'])(
    'rejects %s',
    (input) => {
      expect(() => normalizeBridgeUrl(input)).toThrow(ClientConfigError);
    },
  );
});

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

describe('pickBridgeUrl', () => {
  const all = { explicit: 'http://explicit:1/', env: 'http://env:1', stored: 'http://stored:1' };

  it('prefers the explicit value', () => {
    expect(pickBridgeUrl(all)).toEqual({ value: 'http://explicit:1', source: 'explicit' });
  });

  it('then SR_SPEECH_URL', () => {
    expect(pickBridgeUrl({ ...all, explicit: undefined })).toEqual({
      value: 'http://env:1',
      source: 'env',
    });
  });

  it('then the stored value', () => {
    expect(pickBridgeUrl({ stored: all.stored, explicit: '', env: '' })).toEqual({
      value: 'http://stored:1',
      source: 'config',
    });
  });

  it('then the default', () => {
    expect(pickBridgeUrl({})).toEqual({ value: DEFAULT_BRIDGE_URL, source: 'default' });
  });

  it('names SR_SPEECH_URL when it is invalid', () => {
    expect(() => pickBridgeUrl({ env: 'nope' })).toThrow(/SR_SPEECH_URL/);
  });

  it('overridesStored tells when the stored value cannot win', () => {
    expect(overridesStored({ env: 'http://env:1' })).toBe(true);
    expect(overridesStored({ explicit: '', env: '' })).toBe(false);
  });
});

describe('parseConfigKey', () => {
  it('accepts known keys and rejects others', () => {
    expect(parseConfigKey('url')).toBe('url');
    expect(() => parseConfigKey('colour')).toThrow(ClientConfigError);
    expect(() => parseConfigKey('toString')).toThrow(ClientConfigError);
  });
});
