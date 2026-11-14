import { describe, expect, it, vi } from 'vitest';
import { FakeBridgeApi, FakeClock } from '../../../test/fakes.js';
import {
  BridgeHttpError,
  BridgeNotReadyError,
  BridgeUnreachableError,
  IncompatibleBridgeError,
  SpeechTimeoutError,
  TRUNCATED_HINT,
} from '../../domain/errors.js';
import { SpeechCaptureService } from './speech-capture-service.js';

function setup() {
  const api = new FakeBridgeApi();
  const clock = new FakeClock();
  const sr = new SpeechCaptureService({ api, clock, apiVersion: '1.4' });
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

  it('reads the buffer once, then waits on the live feed until speech arrives', async () => {
    const { api, clock, sr } = setup();
    api.speak('Name, edit');
    clock.at(300, () => api.speak('Dialog, Settings'));
    expect(await sr.waitForOutput(/dialog/i)).toMatchObject({ text: 'Dialog, Settings' });
    expect(clock.now()).toBe(300);
    expect(api.calls).toEqual(['status', 'list 0', 'stream 1']);
    expect(api.openStreams).toBe(0);
  });

  it('does not open the live feed for speech already there', async () => {
    const { api, sr } = setup();
    api.speak('Submit, button');
    await sr.waitForOutput('Submit');
    expect(api.calls.some((c) => c.startsWith('stream'))).toBe(false);
  });

  it('reconnects after a lost connection without losing or repeating speech', async () => {
    const { api, clock, sr } = setup();
    clock.at(100, () => api.speak('one'));
    clock.at(200, () => {
      api.dropStreams(new Error('network'));
      api.speak('two');
    });
    const found = await sr
      .waitForSequence(['one', 'two', 'three'], { timeout: 1000 })
      .catch((e: unknown) => e);
    expect(found).toBeInstanceOf(SpeechTimeoutError);
    expect(texts((found as SpeechTimeoutError).entries)).toEqual(['one', 'two']);
    expect(api.calls.filter((c) => c.startsWith('stream'))).toEqual(['stream 0', 'stream 1']);
    expect(api.openStreams).toBe(0);
  });

  it('closes the live feed on a timeout', async () => {
    const { api, sr } = setup();
    await expect(sr.waitForOutput('never', { timeout: 100 })).rejects.toThrow(SpeechTimeoutError);
    expect(api.openStreams).toBe(0);
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
    expect(api.openStreams).toBe(0);
  });

  it('returns after quietFor when nothing is said', async () => {
    const { clock, sr } = setup();
    await sr.waitForSilence({ quietFor: 300 });
    expect(clock.now()).toBe(300);
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

describe('speech dropped from the bridge buffer', () => {
  /** The error a wait rejected with. */
  const failure = (promise: Promise<unknown>) =>
    promise.then(
      () => {
        throw new Error('expected a timeout');
      },
      (error: unknown) => error as SpeechTimeoutError,
    );

  it('says so when a wait times out after reading a truncated buffer', async () => {
    const { api, sr } = setup();
    api.speak('one', 'two', 'three');
    api.dropOldest(2);
    const error = await failure(sr.waitForOutput('never', { since: 0, timeout: 100 }));
    expect(error).toBeInstanceOf(SpeechTimeoutError);
    expect(error.truncated).toBe(true);
    expect(error.message).toBe(`No speech matched "never" within 100 ms; ${TRUNCATED_HINT}`);
    expect(texts(error.entries)).toEqual(['three']);
  });

  it('keeps the plain message when nothing was dropped', async () => {
    const { api, sr } = setup();
    api.speak('one');
    const error = await failure(sr.waitForOutput('never', { timeout: 100 }));
    expect(error.truncated).toBe(false);
    expect(error.message).toBe('No speech matched "never" within 100 ms');
  });

  it('says so for a sequence too', async () => {
    const { api, sr } = setup();
    api.speak('one', 'two');
    api.dropOldest(1);
    const error = await failure(sr.waitForSequence(['one', 'two'], { since: 0, timeout: 100 }));
    expect(error.truncated).toBe(true);
  });

  it('notices entries dropped while the live feed reconnected', async () => {
    const { api, clock, sr } = setup();
    clock.at(100, () => api.speak('one'));
    clock.at(200, () => {
      api.dropStreams(new Error('network'));
      api.speak('two', 'three');
      api.dropOldest(2);
    });
    const error = await failure(sr.waitForOutput('never', { timeout: 1000 }));
    expect(error.truncated).toBe(true);
    expect(texts(error.entries)).toEqual(['one', 'three']);
  });

  it('still finds a match that survived', async () => {
    const { api, sr } = setup();
    api.speak('one', 'Submit, button');
    api.dropOldest(1);
    await expect(sr.waitForOutput('Submit', { since: 0 })).resolves.toMatchObject({ seq: 2 });
  });

  it('marks a recording whose speech was dropped before it was read', async () => {
    const { api, sr } = setup();
    api.speak('before');
    const recording = await sr.record(() => {
      api.speak('first', 'second');
      api.dropOldest(2);
    });
    expect(recording.truncated).toBe(true);
    expect(texts(recording.entries)).toEqual(['second']);

    const clean = await sr.record(() => api.speak('third'));
    expect(clean.truncated).toBe(false);
  });
});

describe('sessions', () => {
  it('startSession moves the cursor to the session start; reads and waits see only it', async () => {
    const { api, sr } = setup();
    api.speak('earlier test');
    const session = await sr.startSession('checkout', { run: 'nightly' });
    expect(session).toMatchObject({ id: 1, name: 'checkout', run: 'nightly', endedAt: null });
    expect(sr.cursor()).toBe(1);
    api.speak('Submit, button');
    expect(await sr.waitForOutput('Submit')).toMatchObject({ seq: 2, sessionId: 1 });
    expect(texts(await sr.getSpeech({ since: 0, session: 1 }))).toEqual(['Submit, button']);
    expect(api.calls).toContain('list 0 session=1');
  });

  it('startSession moves the cursor to the startSeq the bridge reports', async () => {
    const { api, sr } = setup();
    api.speak('old');
    const start = api.startSession.bind(api);
    api.startSession = async (request) => {
      api.speak('still the old test');
      const session = await start(request);
      api.speak('already the new one');
      return session;
    };
    await sr.startSession('next');
    expect(sr.cursor()).toBe(2);
    expect(texts(await sr.getSpeech())).toEqual(['already the new one']);
  });

  it('endSession and sessions', async () => {
    const { api, sr } = setup();
    await sr.startSession('one');
    await sr.startSession('two');
    await sr.endSession();
    const list = await sr.sessions();
    expect(list.currentId).toBeNull();
    expect(list.sessions.map((s) => [s.name, s.endedAt === null])).toEqual([
      ['two', false],
      ['one', false],
    ]);
    expect(api.calls).toEqual(['status', 'start one', 'start two', 'end', 'sessions']);
  });

  it('a wait in a session only matches that session', async () => {
    const { api, sr } = setup();
    await sr.startSession('one');
    api.speak('Submit, button');
    await sr.startSession('two');
    await expect(
      sr.waitForOutput('Submit', { since: 0, session: 'current', timeout: 100 }),
    ).rejects.toThrow(SpeechTimeoutError);
    await expect(sr.getText({ since: 0, session: 7 })).rejects.toThrow(BridgeHttpError);
  });

  it("a wait keeps the session that was current when it started ('current' is resolved once)", async () => {
    const { api, clock, sr } = setup();
    await sr.startSession('one');
    clock.at(100, () => {
      void api.startSession({ name: 'two' }).then(() => api.speak('Submit, button'));
    });
    await expect(sr.waitForOutput('Submit', { session: 'current', timeout: 500 })).rejects.toThrow(
      SpeechTimeoutError,
    );
    expect(api.calls).toContain('stream 0 session=1');
  });

  it("a wait for 'current' without a current session rejects with NOT_FOUND", async () => {
    const { sr } = setup();
    const error: unknown = await sr
      .waitForOutput('x', { session: 'current' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BridgeHttpError);
    expect(error).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});

describe('bridge restart', () => {
  /** A client whose cursor is at seq 3 of the first bridge run, then a restart. */
  async function restarted() {
    const { api, clock, sr } = setup();
    api.speak('a', 'b', 'c');
    await sr.waitForOutput('c');
    api.restart();
    return { api, clock, sr };
  }

  it('reads the new run from its start: seq keeps rising', async () => {
    const { api, sr } = await restarted();
    api.speak('x', 'y');
    expect(texts(await sr.getSpeech())).toEqual(['x', 'y']);
    expect((await sr.waitForOutput('y')).seq).toBe(1002);
  });

  it('a running wait follows the live feed into the new run', async () => {
    const { api, clock, sr } = setup();
    api.speak('a');
    await sr.waitForOutput('a');
    clock.at(100, () => {
      api.restart();
      api.speak('later');
    });
    expect(await sr.waitForOutput('later')).toMatchObject({ seq: 1001, text: 'later' });
  });

  it('record returns the speech of the new run', async () => {
    const { api, sr } = await restarted();
    const recording = await sr.record(() => api.speak('x'));
    expect(texts(recording.entries)).toEqual(['x']);
    expect(sr.cursor()).toBe(1001);
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
    expect(error).toMatchObject({ bridgeApiVersion: '2.0', clientApiVersion: '1.4' });
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

describe('onSpeech', () => {
  it('checks the version, then delivers live speech; the cursor stays', async () => {
    const { api, sr } = setup();
    const log: string[] = [];
    const stop = sr.onSpeech((entry) => log.push(entry.text));
    await vi.waitFor(() => expect(api.openStreams).toBe(1));
    expect(api.calls).toEqual(['status', 'stream null']);
    api.speak('Submit, button');
    await vi.waitFor(() => expect(log).toEqual(['Submit, button']));
    expect(sr.cursor()).toBe(0);
    stop();
  });
});
