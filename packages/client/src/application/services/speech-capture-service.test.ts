import { describe, expect, it } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
} from '../../domain/errors.js';
import { SpeechCaptureService } from './speech-capture-service.js';

function setup() {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  const sr = new SpeechCaptureService({ api, clock, apiVersion: '1.0' });
  return { api, clock, sr };
}

const texts = (entries: { text: string }[]) => entries.map((e) => e.text);

describe('cursor', () => {
  it('starts at 0, moves past a match, and only later speech is searched next', async () => {
    const { api, sr } = setup();
    api.speak('Submit, button', 'Name, edit', 'Submit, button');
    expect(sr.cursor()).toBe(0);
    expect((await sr.waitForOutput('Submit')).seq).toBe(1);
    expect(sr.cursor()).toBe(1);
    expect((await sr.waitForOutput('Submit')).seq).toBe(3);
    expect(sr.cursor()).toBe(3);
  });

  it('clear() empties the buffer and resets the cursor; seq goes on', async () => {
    const { api, sr } = setup();
    api.speak('old');
    await sr.waitForOutput('old');
    await sr.clear();
    expect(sr.cursor()).toBe(0);
    api.speak('new');
    expect(await sr.waitForOutput('new')).toMatchObject({ seq: 2 });
  });

  it('setCursor checks the value; getSpeech and getText default to the cursor', async () => {
    const { api, sr } = setup();
    api.speak('a', 'b', 'c');
    sr.setCursor(1);
    expect(texts(await sr.getSpeech())).toEqual(['b', 'c']);
    expect(await sr.getText({ since: 0, separator: ' | ' })).toBe('a | b | c');
    expect(() => sr.setCursor(-1)).toThrow(RangeError);
    expect(() => sr.setCursor(1.5)).toThrow(RangeError);
  });

  it('mark() leaves the cursor alone and its seq works as since', async () => {
    const { api, sr } = setup();
    api.speak('before');
    const marker = await sr.mark('step 1');
    api.speak('after');
    expect(sr.cursor()).toBe(0);
    expect(texts(await sr.getSpeech({ since: marker.seq }))).toEqual(['after']);
  });
});

describe('getSpeech', () => {
  it('pages through hasMore, hides markers unless asked, and applies limit', async () => {
    const { api, sr } = setup();
    api.pageSize = 2;
    api.speak('1', '2');
    await sr.mark('m');
    api.speak('3', '4');
    expect(texts(await sr.getSpeech())).toEqual(['1', '2', '3', '4']);
    expect(texts(await sr.getSpeech({ includeMarkers: true }))).toEqual(['1', '2', 'm', '3', '4']);
    expect(texts(await sr.getSpeech({ limit: 3 }))).toEqual(['1', '2', '3']);
  });
});

describe('waitForOutput', () => {
  it('finds speech that arrived before the call', async () => {
    const { api, sr } = setup();
    api.speak('Submit, button');
    expect(await sr.waitForOutput('Submit, button')).toMatchObject({ seq: 1 });
  });

  it('polls until speech arrives', async () => {
    const { api, clock, sr } = setup();
    clock.at(300, () => api.speak('Dialog, Settings'));
    expect(await sr.waitForOutput(/dialog/i)).toMatchObject({ text: 'Dialog, Settings' });
    expect(clock.now()).toBe(300);
    expect(Math.max(...clock.sleeps)).toBe(50);
  });

  it('matches strings, regexes (any flags) and predicates; normalize ignores case and spaces', async () => {
    const { api, sr } = setup();
    api.speak('Name,   EDIT,  blank');
    await expect(sr.waitForOutput('name, edit', { since: 0, timeout: 0 })).rejects.toThrow(
      SpeechTimeoutError,
    );
    expect(await sr.waitForOutput('name, edit', { since: 0, normalize: true })).toBeTruthy();
    expect(await sr.waitForOutput(/^name, edit/g, { since: 0, normalize: true })).toBeTruthy();
    expect(await sr.waitForOutput((e) => e.text.endsWith('blank'), { since: 0 })).toBeTruthy();
  });

  it('never matches markers', async () => {
    const { sr } = setup();
    await sr.mark('Submit');
    await expect(sr.waitForOutput('Submit', { timeout: 100 })).rejects.toThrow(SpeechTimeoutError);
  });

  it('times out with the speech seen and leaves the cursor', async () => {
    const { api, clock, sr } = setup();
    api.speak('one');
    clock.at(100, () => api.speak('two'));
    const error = await sr.waitForOutput('three', { timeout: 1000 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechTimeoutError);
    expect((error as SpeechTimeoutError).message).toBe('No speech matched "three" within 1000 ms');
    expect(texts((error as SpeechTimeoutError).entries)).toEqual(['one', 'two']);
    expect(clock.now()).toBe(1000);
    expect(sr.cursor()).toBe(0);
  });

  it('rejects an empty string', async () => {
    const { sr } = setup();
    await expect(sr.waitForOutput('')).rejects.toThrow(TypeError);
  });
});

describe('waitForSequence', () => {
  it('finds the matches in order with others in between, across polls', async () => {
    const { api, clock, sr } = setup();
    api.speak('Settings', 'noise');
    clock.at(200, () => api.speak('dialog', 'Close, button'));
    const found = await sr.waitForSequence(['Settings', /close/i]);
    expect(texts(found)).toEqual(['Settings', 'Close, button']);
    expect(sr.cursor()).toBe(4);
  });

  it('needs a separate entry for each match and reports progress on timeout', async () => {
    const { api, sr } = setup();
    api.speak('a b');
    const error = await sr.waitForSequence(['a', 'b'], { timeout: 100 }).catch((e: unknown) => e);
    expect((error as Error).message).toBe(
      'Only 1 of 2 matches occurred in order (next: "b") within 100 ms',
    );
  });
});

describe('waitForSilence', () => {
  it('waits quietFor after the last new speech, counted from the call', async () => {
    const { api, clock, sr } = setup();
    api.speak('old, already there');
    clock.at(200, () => api.speak('late'));
    await sr.waitForSilence({ quietFor: 500 });
    expect(clock.now()).toBe(700);
  });

  it('ignores markers and times out while speech goes on', async () => {
    const { api, clock, sr } = setup();
    for (let t = 100; t <= 2000; t += 100) clock.at(t, () => api.speak(`tick ${t}`));
    clock.at(50, () => void sr.mark('m'));
    const error = await sr
      .waitForSilence({ quietFor: 300, timeout: 1000 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpeechTimeoutError);
    expect((error as SpeechTimeoutError).entries.every((e) => e.kind === 'speech')).toBe(true);
  });
});

describe('record', () => {
  it('returns the speech while fn ran until silence, and moves the cursor to the end', async () => {
    const { api, clock, sr } = setup();
    api.speak('before');
    const { result, entries } = await sr.record(() => {
      api.speak('during');
      clock.at(100, () => api.speak('right after'));
      return 42;
    });
    expect(result).toBe(42);
    expect(texts(entries)).toEqual(['during', 'right after']);
    expect(sr.cursor()).toBe(3);
  });
});

describe('version check', () => {
  it('runs once before the first call', async () => {
    const { api, sr } = setup();
    await sr.getSpeech();
    await sr.getSpeech();
    expect(api.calls.filter((c) => c === 'status')).toHaveLength(1);
  });

  it('accepts another minor version and rejects another major version', async () => {
    const { api, sr } = setup();
    api.apiVersion = '1.7';
    await expect(sr.status()).resolves.toBeTruthy();
    api.apiVersion = '2.0';
    const error = await sr.status().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(IncompatibleBridgeError);
    expect(error).toMatchObject({ bridgeApiVersion: '2.0', clientApiVersion: '1.0' });
  });

  it('is repeated after a failure', async () => {
    const { api, sr } = setup();
    api.apiVersion = '2.0';
    await expect(sr.clear()).rejects.toThrow(IncompatibleBridgeError);
    expect(api.calls).not.toContain('clear');
    api.apiVersion = '1.0';
    await sr.clear();
    expect(api.calls).toContain('clear');
  });
});

describe('waitForReady', () => {
  it('retries while unreachable, 503 or starting, then returns the status', async () => {
    const { api, clock, sr } = setup();
    api.failures = [
      new BridgeUnreachableError('http://vm:5151'),
      new BridgeHttpError(503, 'SERVICE_UNAVAILABLE', 'starting'),
    ];
    api.state = 'starting';
    clock.at(1500, () => (api.state = 'ready'));
    expect((await sr.waitForReady()).bridge.state).toBe('ready');
  });

  it('times out with the last reason, and does not retry other errors', async () => {
    const { api, sr } = setup();
    api.state = 'starting';
    await expect(sr.waitForReady({ timeout: 1000 })).rejects.toThrow(
      new BridgeNotReadyError('The bridge was not ready within 1000 ms: state is starting'),
    );
    api.failures = [new BridgeHttpError(500, 'INTERNAL', 'boom')];
    await expect(sr.waitForReady()).rejects.toThrow(BridgeHttpError);
  });
});
