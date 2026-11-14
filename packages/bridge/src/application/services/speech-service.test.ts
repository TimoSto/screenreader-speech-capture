import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import type { SpeechEvent } from '../../domain/speech-event.js';
import { SpeechLog } from '../../domain/speech-log.js';
import type { WatchEvent } from '../ports/in/speech.js';
import { LIST_LIMIT } from '../ports/in/speech.js';
import { REPLAY_PAGE, SpeechService } from './speech-service.js';

function setup(maxEntries = 100) {
  const events = new InProcessEventBus();
  const published: SpeechEvent[] = [];
  events.subscribe((event) => published.push(event));
  const speech = new SpeechService({
    log: new SpeechLog(maxEntries),
    events,
    clock: new SystemClock(),
  });
  return { speech, published };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-07T14:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SpeechService', () => {
  it('records captured lines with voice, connection and timestamp, and publishes them', () => {
    const { speech, published } = setup();
    vi.advanceTimersByTime(250);
    speech.record({ text: 'Submit, button', voice: 'dev', connectionId: 3 });

    const [entry] = speech.list({ since: 0, limit: 10 }).entries;
    expect(entry).toEqual({
      seq: 1,
      kind: 'speech',
      text: 'Submit, button',
      receivedAt: new Date('2026-11-07T14:00:00.250Z'),
      source: 'tcp',
      voice: 'dev',
      connectionId: 3,
      sessionId: null,
    });
    expect(published).toEqual([{ type: 'entry', entry }]);
  });

  it('adds markers into the same timeline', () => {
    const { speech, published } = setup();
    speech.record({ text: 'one', voice: null, connectionId: 1 });
    const marker = speech.addMarker('  step 3 ');
    expect(marker).toMatchObject({ seq: 2, kind: 'marker', text: 'step 3', source: 'api' });
    expect(published.at(-1)).toEqual({ type: 'entry', entry: marker });
  });

  it('rejects empty markers', () => {
    expect(() => setup().speech.addMarker('  ')).toThrow(/label/);
  });

  it('lists with default since and limit, and checks their range', () => {
    const { speech } = setup();
    for (let i = 0; i < 3; i++) speech.record({ text: `l${i}`, voice: null, connectionId: 1 });
    expect(speech.list().entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    for (const options of [{ limit: 0 }, { limit: LIST_LIMIT.max + 1 }, { since: -1 }]) {
      expect(() => speech.list(options)).toThrow(
        expect.objectContaining({ code: 'INVALID_REQUEST' }) as Error,
      );
    }
  });

  it('clears and publishes a clear event', () => {
    const { speech, published } = setup();
    speech.record({ text: 'one', voice: null, connectionId: 1 });
    speech.clear();
    expect(speech.list({ since: 0, limit: 10 }).entries).toEqual([]);
    expect(published.at(-1)).toEqual({ type: 'clear' });
  });
});

describe('SpeechService.watch', () => {
  it('replays entries after since, then follows new events until stopped', () => {
    const { speech } = setup();
    speech.record({ text: 'one', voice: null, connectionId: 1 });
    speech.record({ text: 'two', voice: null, connectionId: 1 });
    const seen: string[] = [];
    const stop = speech.watch(1, (event) =>
      seen.push(event.type === 'entry' ? event.entry.text : 'clear'),
    );
    speech.record({ text: 'three', voice: null, connectionId: 1 });
    speech.clear();
    stop();
    speech.record({ text: 'four', voice: null, connectionId: 1 });
    expect(seen).toEqual(['two', 'three', 'clear']);
  });

  it('reports truncated before the replay when entries after since were dropped', () => {
    const { speech } = setup(2);
    for (const text of ['one', 'two', 'three'])
      speech.record({ text, voice: null, connectionId: 1 });
    const seen: string[] = [];
    speech.watch(0, (event) => seen.push(event.type === 'entry' ? event.entry.text : event.type));
    expect(seen).toEqual(['truncated', 'two', 'three']);
  });

  it('only follows new events without since', () => {
    const { speech } = setup();
    speech.record({ text: 'one', voice: null, connectionId: 1 });
    const seen: number[] = [];
    speech.watch(null, (event) => event.type === 'entry' && seen.push(event.entry.seq));
    speech.record({ text: 'two', voice: null, connectionId: 1 });
    expect(seen).toEqual([2]);
  });
});

describe('SpeechService.watch with pace', () => {
  const say = (speech: SpeechService, ...texts: string[]) => {
    for (const text of texts) speech.record({ text, voice: null, connectionId: 1 });
  };
  const show = (event: WatchEvent) => (event.type === 'entry' ? event.entry.text : event.type);

  /** A `pace` that pauses after the given replayed entries (1-based), until `resume()`. */
  function pauser(...at: number[]) {
    let calls = 0;
    let release: (() => void) | undefined;
    return {
      pace: () => {
        calls++;
        if (!at.includes(calls)) return undefined;
        return new Promise<void>((resolve) => (release = resolve));
      },
      resume: async () => {
        release?.();
        release = undefined;
        await vi.advanceTimersByTimeAsync(0);
      },
    };
  }

  it('replays page by page, pausing where pace says, without gap or repeat', async () => {
    const { speech } = setup(10_000);
    const texts = Array.from({ length: REPLAY_PAGE * 2 + 10 }, (_, i) => `t${i}`);
    say(speech, ...texts);
    const seen: string[] = [];
    const { pace, resume } = pauser(3, REPLAY_PAGE + 1);
    speech.watch(0, (event) => seen.push(show(event)), { pace });
    expect(seen).toEqual(texts.slice(0, 3));
    await resume();
    expect(seen).toEqual(texts.slice(0, REPLAY_PAGE + 1));
    await resume();
    expect(seen).toEqual(texts);
  });

  it('delivers entries added while paused once, in order, then follows live', async () => {
    const { speech } = setup();
    say(speech, 'one', 'two', 'three');
    const seen: string[] = [];
    const { pace, resume } = pauser(1);
    speech.watch(0, (event) => seen.push(show(event)), { pace });
    say(speech, 'four');
    expect(seen).toEqual(['one']);
    await resume();
    say(speech, 'five');
    expect(seen).toEqual(['one', 'two', 'three', 'four', 'five']);
  });

  it('reports truncated again when entries were dropped while paused', async () => {
    const { speech } = setup(3);
    say(speech, 'one', 'two', 'three');
    const seen: string[] = [];
    const { pace, resume } = pauser(1);
    speech.watch(0, (event) => seen.push(show(event)), { pace });
    say(speech, 'four', 'five', 'six');
    await resume();
    expect(seen).toEqual(['one', 'truncated', 'four', 'five', 'six']);
  });

  it('passes a clear while paused, then replays what came after it', async () => {
    const { speech } = setup();
    say(speech, 'one', 'two');
    const seen: string[] = [];
    const { pace, resume } = pauser(1);
    speech.watch(0, (event) => seen.push(show(event)), { pace });
    speech.clear();
    say(speech, 'three');
    await resume();
    expect(seen).toEqual(['one', 'clear', 'three']);
  });

  it('stops while paused', async () => {
    const { speech } = setup();
    say(speech, 'one', 'two');
    const seen: string[] = [];
    const { pace, resume } = pauser(1);
    const stop = speech.watch(0, (event) => seen.push(show(event)), { pace });
    stop();
    say(speech, 'three');
    await resume();
    expect(seen).toEqual(['one']);
  });

  it('throws from watch for a listener error before the first pause', () => {
    const { speech, published } = setup();
    say(speech, 'one');
    const boom = new Error('boom');
    expect(() =>
      speech.watch(
        0,
        () => {
          throw boom;
        },
        { pace: () => undefined },
      ),
    ).toThrow(boom);
    say(speech, 'two');
    expect(published).toHaveLength(2);
  });

  it('hands a listener error after a pause to onError and stops', async () => {
    const { speech } = setup();
    say(speech, 'one', 'two');
    const onError = vi.fn();
    const seen: string[] = [];
    const { pace, resume } = pauser(1);
    speech.watch(
      0,
      (event) => {
        if (show(event) === 'two') throw new Error('boom');
        seen.push(show(event));
      },
      { pace, onError },
    );
    await resume();
    say(speech, 'three');
    expect(onError).toHaveBeenCalledWith(new Error('boom'));
    expect(seen).toEqual(['one']);
  });
});
