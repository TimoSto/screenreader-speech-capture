import { describe, expect, it } from 'vitest';
import { DEFAULT_BRIDGE_URL, URL_SETTING, normalizeBridgeUrl } from './bridge-url.js';
import { overridesStored, pickValue } from './config-value.js';
import { ClientConfigError } from './errors.js';

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

describe('pickValue for the bridge URL', () => {
  const all = { explicit: 'http://explicit:1/', env: 'http://env:1', stored: 'http://stored:1' };

  it('prefers the explicit value', () => {
    expect(pickValue(URL_SETTING, all)).toEqual({ value: 'http://explicit:1', source: 'explicit' });
  });

  it('then SR_SPEECH_URL', () => {
    expect(pickValue(URL_SETTING, { ...all, explicit: undefined })).toEqual({
      value: 'http://env:1',
      source: 'env',
    });
  });

  it('then the stored value', () => {
    expect(pickValue(URL_SETTING, { stored: all.stored, explicit: '', env: '' })).toEqual({
      value: 'http://stored:1',
      source: 'config',
    });
  });

  it('then the default', () => {
    expect(pickValue(URL_SETTING, {})).toEqual({ value: DEFAULT_BRIDGE_URL, source: 'default' });
  });

  it('names SR_SPEECH_URL when it is invalid', () => {
    expect(() => pickValue(URL_SETTING, { env: 'nope' })).toThrow(/SR_SPEECH_URL/);
  });

  it('overridesStored tells when the stored value cannot win', () => {
    expect(overridesStored({ env: 'http://env:1' })).toBe(true);
    expect(overridesStored({ explicit: '', env: '' })).toBe(false);
  });
});
