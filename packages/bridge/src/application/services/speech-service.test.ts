import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import { MemorySessionRepository } from '../../adapters/out/memory/memory-session-repository.js';
import { MemorySpeechRepository } from '../../adapters/out/memory/memory-speech-repository.js';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import type { SpeechEvent } from '../../domain/speech-event.js';
import { LIST_LIMIT } from '../ports/in/speech.js';
import { SpeechService } from './speech-service.js';

function setup(maxEntries = 100) {
  const events = new InProcessEventBus();
  const published: SpeechEvent[] = [];
  events.subscribe((event) => published.push(event));
  const speech = new SpeechService({
    repository: new MemorySpeechRepository(maxEntries),
    events,
    clock: new SystemClock(),
    sessions: new MemorySessionRepository(),
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
