import { describe, expect, it } from 'vitest';
import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';
import type { BridgeStatus } from '../../../domain/bridge-status.js';
import {
  GLOBAL_OPTIONS,
  OPTIONS,
  UsageError,
  checkOptions,
  expectArgs,
  optionalInt,
  scope,
  type Values,
} from './options.js';

/** Parsed options; like parseArgs, an option may be present but `undefined`. */
const values = (v: { [K in keyof Values]?: Values[K] | undefined }) =>
  ({ json: false, help: false, version: false, ...v }) as Values;

describe('checkOptions', () => {
  it('accepts global options and the allowed ones', () => {
    expect(() =>
      checkOptions('wait', ['timeout'], values({ url: 'http://x', json: true, timeout: '5' })),
    ).not.toThrow();
  });

  it('rejects an option the command does not take', () => {
    expect(() => checkOptions('clear', [], values({ since: '1' }))).toThrow(
      new UsageError('"clear" does not take --since.'),
    );
  });

  it('ignores options that were not given', () => {
    expect(() => checkOptions('clear', [], values({ since: undefined }))).not.toThrow();
  });
});

describe('optionalInt', () => {
  it('is undefined when the option is missing', () => {
    expect(optionalInt(values({}), 'since', 0)).toBeUndefined();
  });

  it('parses integers >= min', () => {
    expect(optionalInt(values({ since: '0' }), 'since', 0)).toBe(0);
    expect(optionalInt(values({ limit: '25' }), 'limit', 1)).toBe(25);
  });

  it.each(['-1', '1.5', '1e3', 'abc', '', ' 1', '99999999999999999999'])('rejects %j', (raw) => {
    expect(() => optionalInt(values({ since: raw }), 'since', 0)).toThrow(UsageError);
  });

  it('rejects values below min and names the option', () => {
    expect(() => optionalInt(values({ limit: '0' }), 'limit', 1)).toThrow(
      '--limit must be an integer >= 1, got "0".',
    );
  });
});

describe('expectArgs', () => {
  it('returns the arguments when the count matches', () => {
    expect(expectArgs(['a', 'b'], 2, 'x <a> <b>')).toEqual(['a', 'b']);
    expect(expectArgs([], 0, 'x')).toEqual([]);
  });

  it('throws the usage line otherwise', () => {
    expect(() => expectArgs(['a'], 0, 'clear')).toThrow(
      'Usage: screenreader-speech-capture-client clear',
    );
  });
});

describe('scope', () => {
  function speech(session: BridgeStatus['session']) {
    const calls: string[] = [];
    const fake = {
      status: () => {
        calls.push('status');
        return Promise.resolve({ session } as BridgeStatus);
      },
    } as unknown as SpeechCapture;
    return { fake, calls };
  }

  it('uses --session without asking the bridge', async () => {
    const { fake, calls } = speech({ current: null, count: 0 });
    expect(await scope(values({ session: '4' }), fake)).toBe(4);
    expect(calls).toEqual([]);
  });

  it('reads the whole buffer with --all', async () => {
    const { fake, calls } = speech({ current: null, count: 0 });
    expect(await scope(values({ all: true }), fake)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('rejects --session together with --all', async () => {
    await expect(
      scope(values({ session: '1', all: true }), speech({ current: null, count: 0 }).fake),
    ).rejects.toThrow('Use either --session or --all.');
  });

  it('rejects --session 0', async () => {
    await expect(
      scope(values({ session: '0' }), speech({ current: null, count: 0 }).fake),
    ).rejects.toThrow(UsageError);
  });

  it('defaults to the id of the current session', async () => {
    const current = { id: 7 } as BridgeStatus['session']['current'];
    expect(await scope(values({}), speech({ current, count: 1 }).fake)).toBe(7);
  });

  it('reads the whole buffer without a current session', async () => {
    expect(await scope(values({}), speech({ current: null, count: 0 }).fake)).toBeUndefined();
  });
});

it('every global option is a known option', () => {
  for (const { option } of GLOBAL_OPTIONS) expect(Object.hasOwn(OPTIONS, option)).toBe(true);
});
