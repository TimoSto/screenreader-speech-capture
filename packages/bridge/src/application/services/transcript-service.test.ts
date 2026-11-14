import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../test/fakes.js';
import { InProcessEventBus } from '../../adapters/out/memory/in-process-event-bus.js';
import type { SessionSummary } from '../../domain/session.js';
import type { SpeechEntry } from '../../domain/speech-entry.js';
import { TranscriptService } from './transcript-service.js';

const entry = (kind: SpeechEntry['kind'], text: string): SpeechEntry => ({
  seq: 1,
  kind,
  text,
  receivedAt: new Date(0),
  source: kind === 'speech' ? 'tcp' : 'api',
  voice: null,
  connectionId: kind === 'speech' ? 1 : null,
  sessionId: null,
});

const session = (endedAt: Date | null): SessionSummary => ({
  id: 3,
  name: 'checkout',
  run: null,
  client: null,
  startedAt: new Date(0),
  endedAt,
  startSeq: 0,
  firstSeq: null,
  lastSeq: null,
  entries: 0,
});

function setup() {
  const events = new InProcessEventBus();
  const transcript = new MemoryLogger();
  const stop = new TranscriptService({ events, transcript }).start();
  return { events, transcript, stop };
}

describe('TranscriptService', () => {
  it('logs speech entries at debug, not markers or clears', () => {
    const { events, transcript } = setup();
    events.publish({ type: 'entry', entry: entry('speech', 'Submit, button') });
    events.publish({ type: 'entry', entry: entry('marker', 'step 1') });
    events.publish({ type: 'clear' });
    expect(transcript.lines).toEqual(['debug #1 (connection 1) Submit, button']);
  });

  it('logs session starts and ends', () => {
    const { events, transcript } = setup();
    events.publish({ type: 'session', session: session(null) });
    events.publish({ type: 'session', session: session(new Date(1)) });
    expect(transcript.lines).toEqual([
      'debug session 3 started: checkout',
      'debug session 3 ended',
    ]);
  });

  it('stops when the returned function is called', () => {
    const { events, transcript, stop } = setup();
    stop();
    events.publish({ type: 'entry', entry: entry('speech', 'x') });
    expect(transcript.lines).toEqual([]);
  });
});
