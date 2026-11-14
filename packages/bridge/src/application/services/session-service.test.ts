import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import type { SpeechEvent } from '../../domain/speech-event.js';
import { SpeechLog } from '../../domain/speech-log.js';
import { SessionService } from './session-service.js';
import { SpeechService } from './speech-service.js';

function setup(maxEntries = 100) {
  const log = new SpeechLog(maxEntries);
  const events = new InProcessEventBus();
  const clock = new SystemClock();
  const published: SpeechEvent[] = [];
  events.subscribe((event) => published.push(event));
  const speech = new SpeechService({ log, events, clock });
  const sessions = new SessionService({ log, events, clock });
  const say = (text: string) => speech.record({ text, voice: null, connectionId: 1 });
  return { speech, sessions, say, published };
}

const notFound = expect.objectContaining({ code: 'NOT_FOUND' }) as Error;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-12T09:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('SessionService', () => {
  it('starts a session that becomes current and publishes it', () => {
    const { sessions, published } = setup();
    const session = sessions.start({ name: '  checkout  ', run: 'nightly' });
    expect(session).toEqual({
      id: 1,
      name: 'checkout',
      run: 'nightly',
      startedAt: new Date('2026-11-12T09:00:00.000Z'),
      endedAt: null,
      startSeq: 0,
      firstSeq: null,
      lastSeq: null,
      entries: 0,
    });
    expect(published).toEqual([{ type: 'session', session }]);
    expect(sessions.list()).toEqual({ sessions: [session], currentId: 1 });
  });

  it('ends the previous session first, publishing both, with the ended one counted', () => {
    const { sessions, say, published } = setup();
    sessions.start({ name: 'a' });
    say('one');
    vi.advanceTimersByTime(1000);
    sessions.start({ name: 'b' });
    const [, , ended, started] = published;
    expect(ended).toMatchObject({
      type: 'session',
      session: {
        id: 1,
        endedAt: new Date('2026-11-12T09:00:01.000Z'),
        firstSeq: 1,
        lastSeq: 1,
        entries: 1,
      },
    });
    expect(started).toMatchObject({ type: 'session', session: { id: 2, endedAt: null } });
    expect(sessions.list().sessions.map((s) => s.id)).toEqual([2, 1]);
  });

  it('ends the current session, and does nothing without one', () => {
    const { sessions, published } = setup();
    sessions.end();
    expect(published).toEqual([]);
    sessions.start({ name: 'a' });
    sessions.end();
    expect(published.at(-1)).toMatchObject({
      session: { id: 1, endedAt: expect.any(Date) as Date },
    });
    // Ended without entries: nothing left to list.
    expect(sessions.list()).toEqual({ sessions: [], currentId: null });
  });

  it.each([
    [{ name: ' ' }, 'name'],
    [{ name: 'x'.repeat(1001) }, 'name'],
    [{ name: 'a', run: '' }, 'run'],
  ])('rejects %o, naming the field', (options, field) => {
    expect(() => setup().sessions.start(options)).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST', details: { field } }) as Error,
    );
  });

  it('forgets an ended session once all its entries were dropped', () => {
    const { sessions, say } = setup(2);
    sessions.start({ name: 'a' });
    say('a1');
    sessions.start({ name: 'b' });
    say('b1');
    expect(sessions.list().sessions.map((s) => s.id)).toEqual([2, 1]);
    say('b2');
    expect(sessions.list().sessions.map((s) => s.id)).toEqual([2]);
  });
});

describe('SpeechService with sessions', () => {
  it('stamps speech and markers with the current session', () => {
    const { speech, sessions, say } = setup();
    say('before');
    sessions.start({ name: 'a' });
    say('inside');
    speech.addMarker('step');
    sessions.end();
    say('after');
    expect(speech.list().entries.map((e) => e.sessionId)).toEqual([null, 1, 1, null]);
  });

  it('lists one session, resolving current at the call', () => {
    const { speech, sessions, say } = setup();
    expect(() => speech.list({ session: 'current' })).toThrow(notFound);
    expect(() => speech.list({ session: 1 })).toThrow(notFound);
    sessions.start({ name: 'a' });
    say('a1');
    sessions.start({ name: 'b' });
    say('b1');
    expect(speech.list({ session: 'current' }).entries.map((e) => e.text)).toEqual(['b1']);
    expect(speech.list({ session: 1 }).entries.map((e) => e.text)).toEqual(['a1']);
    expect(() => speech.list({ session: 0 })).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST' }) as Error,
    );
  });

  it('watches one session: its entries, and every clear and session event', () => {
    const { speech, sessions, say } = setup();
    sessions.start({ name: 'a' });
    say('a1');
    const seen: string[] = [];
    speech.watch(0, (event) => seen.push(event.type === 'entry' ? event.entry.text : event.type), {
      session: 'current',
    });
    sessions.start({ name: 'b' });
    say('b1');
    speech.clear();
    expect(seen).toEqual(['a1', 'session', 'session', 'clear']);
    expect(() => speech.watch(null, () => {}, { session: 7 })).toThrow(notFound);
  });

  it('clear wipes the ended sessions and keeps the current one, empty', () => {
    const { speech, sessions, say } = setup();
    sessions.start({ name: 'a' });
    say('a1');
    sessions.start({ name: 'b' });
    say('b1');
    speech.clear();
    expect(sessions.list()).toMatchObject({
      sessions: [{ id: 2, entries: 0, firstSeq: null }],
      currentId: 2,
    });
    say('b2');
    expect(speech.list({ session: 'current' }).entries.map((e) => e.text)).toEqual(['b2']);
  });
});

describe('forgetting ended sessions', () => {
  it('forgets a session that ends without entries, and keeps one that has some', () => {
    const { sessions, say } = setup();
    sessions.start({ name: 'empty' });
    sessions.start({ name: 'spoken' });
    say('s1');
    sessions.end();
    expect(sessions.list().sessions.map((s) => s.name)).toEqual(['spoken']);
  });

  it('forgets an ended session once the full buffer drops its last entry', () => {
    const { sessions, say } = setup(2);
    sessions.start({ name: 'a' });
    say('a1');
    sessions.start({ name: 'b' });
    say('b1');
    say('b2'); // pushes a1 out
    expect(sessions.list().sessions.map((s) => s.name)).toEqual(['b']);
  });

  it('forgets an ended session whose last entry a smaller buffer drops', () => {
    const { speech, sessions, say } = setup(10);
    sessions.start({ name: 'a' });
    say('a1');
    sessions.start({ name: 'b' });
    say('b1');
    speech.setMaxEntries(1);
    expect(speech.list().entries.map((e) => e.text)).toEqual(['b1']);
    expect(sessions.list().sessions.map((s) => s.name)).toEqual(['b']);
  });
});
