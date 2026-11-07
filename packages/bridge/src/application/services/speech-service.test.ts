import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import { MemorySpeechRepository } from '../../adapters/out/memory/memory-speech-repository.js';
import { SystemClock } from '../../adapters/out/clock/system-clock.js';
import type { SpeechEvent } from '../ports/out/speech-event-bus.js';
import { SpeechService } from './speech-service.js';

function setup() {
  const events = new InProcessEventBus();
  const published: SpeechEvent[] = [];
  events.subscribe((event) => published.push(event));
  const speech = new SpeechService({
    repository: new MemorySpeechRepository(100),
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

  it('clears and publishes a clear event', () => {
    const { speech, published } = setup();
    speech.record({ text: 'one', voice: null, connectionId: 1 });
    speech.clear();
    expect(speech.list({ since: 0, limit: 10 }).entries).toEqual([]);
    expect(published.at(-1)).toEqual({ type: 'clear' });
  });
});
