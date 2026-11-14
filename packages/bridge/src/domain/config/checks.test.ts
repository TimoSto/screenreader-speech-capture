import { describe, expect, it } from 'vitest';
import {
  boolean,
  encoding,
  hostList,
  integer,
  nonEmptyString,
  nullableString,
  nullableVersion,
  oneOf,
  port,
} from './checks.js';

const ok = undefined;

describe('config checks', () => {
  it('integer: whole numbers within the bounds', () => {
    const check = integer(1, 3);
    expect([1, 3].map(check)).toEqual([ok, ok]);
    expect([0, 4, 1.5, '2', null].map(check)).toEqual(
      Array(5).fill('must be an integer from 1 to 3'),
    );
  });

  it('port: 0 to 65535', () => {
    expect([0, 65535].map(port)).toEqual([ok, ok]);
    expect(port(65536)).toBe('must be an integer from 0 to 65535');
  });

  it('boolean: only true and false', () => {
    expect([true, false].map(boolean)).toEqual([ok, ok]);
    expect(boolean('true')).toBe('must be true or false');
  });

  it('nonEmptyString: not blank', () => {
    expect(nonEmptyString('x')).toBe(ok);
    expect(['', '  ', 1].map(nonEmptyString)).toEqual(Array(3).fill('must be a non-empty string'));
  });

  it('nullableString: null or a non-empty string', () => {
    expect([null, 'x'].map(nullableString)).toEqual([ok, ok]);
    expect(nullableString('')).toBe('must be a non-empty string or null');
  });

  it('nullableVersion: null or an exact version', () => {
    expect([null, '1.2.3'].map(nullableVersion)).toEqual([ok, ok]);
    expect(nullableVersion('latest')).toBe('must be an exact version like 1.56.1, or null');
  });

  it('oneOf: one of the listed values', () => {
    const check = oneOf(['a', 'b']);
    expect(check('a')).toBe(ok);
    expect(check('c')).toBe('must be one of a, b');
  });

  it('hostList: host names without port or scheme, or *', () => {
    expect([[], ['bridge.lab.example', 'WIN-VM'], ['*']].map(hostList)).toEqual([ok, ok, ok]);
    expect([['a:5151'], ['http://a'], [''], ['a b'], 'a', [1], null].map(hostList)).toEqual(
      Array(7).fill('must be a list of host names (without port or scheme), or ["*"]'),
    );
  });

  it('encoding: a label TextDecoder knows', () => {
    expect(['windows-1252', 'utf-8', 'latin1'].map(encoding)).toEqual([ok, ok, ok]);
    expect(encoding('klingon')).toBe('unknown encoding "klingon"');
    expect(encoding(1)).toBe('must be a string');
  });
});
