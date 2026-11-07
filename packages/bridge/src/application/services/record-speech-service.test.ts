import { describe, expect, it } from 'vitest';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import { RingBufferRepository } from '../../adapters/out/memory/ring-buffer-repository.js';
import { FakeClock, MemoryLogger } from '../../../test/fakes.js';
import type { SpeechEvent } from '../ports/out/speech-event-bus.js';
import { RecordSpeechService } from './record-speech-service.js';
import { SpeechService } from './speech-service.js';

function setup() {
  const clock = new FakeClock();
  const repository = new RingBufferRepository(100);
  const events = new InProcessEventBus();
  const published: SpeechEvent[] = [];
  events.subscribe((event) => published.push(event));
  const logger = new MemoryLogger();
  const transcript = new MemoryLogger();
  const recorder = new RecordSpeechService({
    repository,
    events,
    clock,
    logger,
    transcript,
  });
  const speech = new SpeechService({ repository, events, clock });
  return { clock, recorder, speech, published, logger, transcript };
}

describe('RecordSpeechService', () => {
  it('records lines with voice, connection and timestamps, and publishes them', () => {
    const { clock, recorder, speech, published } = setup();
    const id = recorder.connectionOpened();
    recorder.setVoice(id, 'dev');
    clock.advance(250);
    recorder.record(id, 'Submit, button');

    const [entry] = speech.list({ since: 0, limit: 10 }).entries;
    expect(entry).toEqual({
      seq: 1,
      kind: 'speech',
      text: 'Submit, button',
      receivedAt: new Date('2026-11-07T14:00:00.250Z'),
      monotonicMs: 1250,
      source: 'tcp',
      voice: 'dev',
      connectionId: id,
    });
    expect(published).toEqual([{ type: 'entry', entry }]);
  });

  it('logs the recorded text to the transcript only, not to the normal log', () => {
    const { recorder, logger, transcript } = setup();
    recorder.record(recorder.connectionOpened(), 'Submit, button');
    expect(transcript.lines).toEqual(['debug #1 (connection 1) Submit, button']);
    expect(logger.lines.filter((line) => line.includes('Submit'))).toEqual([]);
  });

  it('tracks open connections and the listener', () => {
    const { recorder } = setup();
    expect(recorder.listenerState()).toBeNull();
    recorder.listenerStarted({ host: '127.0.0.1', port: 4449, encoding: 'windows-1252' });
    const a = recorder.connectionOpened();
    const b = recorder.connectionOpened();
    recorder.setVoice(b, 'ssc5000');
    recorder.connectionClosed(a);
    expect(recorder.connections()).toEqual([
      { id: b, voice: 'ssc5000', connectedAt: new Date('2026-11-07T14:00:00.000Z') },
    ]);
    recorder.listenerStopped();
    expect(recorder.listenerState()).toMatchObject({ listening: false, port: 4449 });
  });
});

describe('SpeechService', () => {
  it('adds markers into the same timeline', () => {
    const { recorder, speech, published } = setup();
    recorder.record(recorder.connectionOpened(), 'one');
    const marker = speech.addMarker('  step 3 ');
    expect(marker).toMatchObject({ seq: 2, kind: 'marker', text: 'step 3', source: 'api' });
    expect(published.at(-1)).toEqual({ type: 'entry', entry: marker });
  });

  it('rejects empty markers', () => {
    expect(() => setup().speech.addMarker('  ')).toThrow(/label/);
  });

  it('clears and publishes a clear event', () => {
    const { recorder, speech, published } = setup();
    recorder.record(recorder.connectionOpened(), 'one');
    speech.clear();
    expect(speech.list({ since: 0, limit: 10 }).entries).toEqual([]);
    expect(published.at(-1)).toEqual({ type: 'clear' });
  });
});
