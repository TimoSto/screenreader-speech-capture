import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeferredEventBus } from '../../../test/fakes.js';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import { SpeechLog } from '../../domain/speech-log.js';
import type { WatchEvent } from '../ports/in/speech.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import { SpeechService } from '../services/speech-service.js';
import { followLog } from './follow-log.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** The buses the `SpeechEventBus` contract allows: one that delivers at once, one that delivers late. */
const buses: [string, () => SpeechEventBus & { flush(): void }][] = [
  ['a synchronous bus', () => Object.assign(new InProcessEventBus(), { flush: () => {} })],
  ['a bus that delivers late', () => new DeferredEventBus()],
];

const show = (event: WatchEvent) => (event.type === 'entry' ? event.entry.text : event.type);

describe.each(buses)('followLog on %s', (_, createBus) => {
  function setup() {
    const log = new SpeechLog(100);
    const events = createBus();
    const speech = new SpeechService({ log, events, clock: new SystemClock() });
    const say = (...texts: string[]) => {
      for (const text of texts) speech.record({ text, voice: null, connectionId: 1 });
    };
    const seen: string[] = [];
    const follow = (
      since: number | null,
      options: Parameters<typeof followLog>[3] = {},
      sessionId?: number | null,
    ) => followLog({ log, events }, { since, sessionId }, (e) => seen.push(show(e)), options);
    return { log, events, speech, say, seen, follow };
  }

  /** A `pace` that pauses after the first replayed entry, until `resume()`. */
  function pauser() {
    let calls = 0;
    let release: (() => void) | undefined;
    return {
      pace: () => (++calls === 1 ? new Promise<void>((resolve) => (release = resolve)) : undefined),
      resume: async () => {
        release?.();
        await vi.advanceTimersByTimeAsync(0);
      },
    };
  }

  it('replays, then follows live, without gap or duplicate', () => {
    const { say, seen, follow, events } = setup();
    say('one', 'two');
    follow(1);
    say('three');
    events.flush();
    expect(seen).toEqual(['two', 'three']);
  });

  it('sees entries added during a paused replay once, in order', async () => {
    const { say, seen, follow, events } = setup();
    say('one', 'two');
    const { pace, resume } = pauser();
    follow(0, { pace });
    say('three');
    await resume();
    say('four');
    events.flush();
    expect(seen).toEqual(['one', 'two', 'three', 'four']);
  });

  it('drops the late copy of an entry the replay already read', async () => {
    const { say, seen, follow, events } = setup();
    say('one');
    const { pace, resume } = pauser();
    follow(0, { pace });
    // Published while paused; a late bus delivers it only after the replay has read it.
    say('two');
    await resume();
    events.flush();
    expect(seen).toEqual(['one', 'two']);
  });

  it('only follows new entries without since', () => {
    const { say, seen, follow, events } = setup();
    say('old');
    follow(null);
    say('new');
    events.flush();
    expect(seen).toEqual(['new']);
  });

  it("follows one session's entries live, and passes clear and session events", () => {
    const { log, say, seen, follow, events, speech } = setup();
    log.startSession({ name: 'a', run: null, client: null, startedAt: new Date() });
    say('a1');
    follow(0, {}, 1);
    log.startSession({ name: 'b', run: null, client: null, startedAt: new Date() });
    say('b1');
    speech.clear();
    events.flush();
    expect(seen).toEqual(['a1', 'clear']);
  });

  it('delivers nothing after stop, also not what a late bus still held', () => {
    const { say, seen, follow, events } = setup();
    const stop = follow(null);
    say('held');
    const before = [...seen];
    stop();
    say('after');
    events.flush();
    // A synchronous bus delivered `held` before the stop; a late one never does.
    expect(seen).toEqual(before);
  });
});
