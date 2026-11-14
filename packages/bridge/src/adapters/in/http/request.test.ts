import type http from 'node:http';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../domain/errors.js';
import {
  booleanParam,
  intParam,
  lastEventId,
  nullableStringField,
  requireJson,
  sessionParam,
  stringField,
} from './request.js';

const url = (query: string) => new URL(`http://bridge/x?${query}`);
describe('intParam', () => {
  it('is undefined when missing or empty', () => {
    expect(intParam(url(''), 'n')).toBeUndefined();
    expect(intParam(url('n='), 'n')).toBeUndefined();
  });

  it('parses integers, leaving the range to the application', () => {
    expect(intParam(url('n=0'), 'n')).toBe(0);
    expect(intParam(url('n=-1'), 'n')).toBe(-1);
    expect(intParam(url('n=10000'), 'n')).toBe(10000);
  });

  it.each(['1.5', 'abc', '1e3', ' 1'])('rejects %s, naming the field', (value) => {
    expect(() => intParam(url(`n=${encodeURIComponent(value)}`), 'n')).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST', details: { field: 'n' } }) as Error,
    );
  });
});

describe('booleanParam', () => {
  it('accepts 1/true/0/false and treats missing as undefined', () => {
    expect(booleanParam(url('b=1'), 'b')).toBe(true);
    expect(booleanParam(url('b=true'), 'b')).toBe(true);
    expect(booleanParam(url('b=0'), 'b')).toBe(false);
    expect(booleanParam(url('b=false'), 'b')).toBe(false);
    expect(booleanParam(url(''), 'b')).toBeUndefined();
    expect(() => booleanParam(url('b=yes'), 'b')).toThrow(AppError);
  });
});

describe('requireJson', () => {
  const request = (type?: string) =>
    ({ headers: type === undefined ? {} : { 'content-type': type } }) as http.IncomingMessage;

  it('accepts application/json, with parameters and in any case', () => {
    expect(() => requireJson(request('application/json'))).not.toThrow();
    expect(() => requireJson(request('Application/JSON; charset=utf-8'))).not.toThrow();
  });

  it.each([undefined, 'text/plain', 'application/x-www-form-urlencoded'])(
    'rejects %s, naming content-type',
    (type) => {
      expect(() => requireJson(request(type))).toThrow(
        expect.objectContaining({ details: { field: 'content-type' } }) as Error,
      );
    },
  );
});

describe('sessionParam', () => {
  it('accepts current, none and positive ids, and treats missing as undefined', () => {
    expect(sessionParam(url(''))).toBeUndefined();
    expect(sessionParam(url('session='))).toBeUndefined();
    expect(sessionParam(url('session=current'))).toBe('current');
    expect(sessionParam(url('session=none'))).toBe('none');
    expect(sessionParam(url('session=7'))).toBe(7);
  });

  it.each(['0', '-1', '1.5', 'latest', 'None', 'null', '99999999999999999999'])(
    'rejects %s',
    (value) => {
      expect(() => sessionParam(url(`session=${value}`))).toThrow(
        expect.objectContaining({
          code: 'INVALID_REQUEST',
          details: { field: 'session' },
        }) as Error,
      );
    },
  );
});

describe('body fields', () => {
  const field = (name: string) => expect.objectContaining({ details: { field: name } }) as Error;

  it('reads a required string, treating a non-object body as missing', () => {
    expect(stringField({ label: 'x' }, 'label')).toBe('x');
    for (const body of [{}, { label: 1 }, null, 'label', ['x']]) {
      expect(() => stringField(body, 'label')).toThrow(field('label'));
    }
  });

  it('reads an optional string that may be null', () => {
    expect(nullableStringField({ run: 'r' }, 'run')).toBe('r');
    expect(nullableStringField({ run: null }, 'run')).toBeNull();
    expect(nullableStringField({}, 'run')).toBeUndefined();
    expect(() => nullableStringField({ run: 1 }, 'run')).toThrow(field('run'));
  });
});

describe('lastEventId', () => {
  const request = (id?: string) =>
    ({ headers: id === undefined ? {} : { 'last-event-id': id } }) as http.IncomingMessage;

  it('is null on a first connect and a seq on a reconnect', () => {
    expect(lastEventId(request())).toBeNull();
    expect(lastEventId(request(''))).toBeNull();
    expect(lastEventId(request('42'))).toBe(42);
  });

  it.each(['-1', 'abc', '1.5', '99999999999999999999'])('rejects %s', (value) => {
    expect(() => lastEventId(request(value))).toThrow(
      expect.objectContaining({ details: { field: 'Last-Event-ID' } }) as Error,
    );
  });
});
