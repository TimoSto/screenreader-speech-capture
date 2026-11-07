import { describe, expect, it } from 'vitest';
import { MemoryLogger } from '../../../../test/fakes.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import { InProcessEventBus } from '../memory/in-process-event-bus.js';
import { logSpeechTranscript } from './speech-transcript.js';

const entry = (kind: SpeechEntry['kind'], text: string): SpeechEntry => ({
  seq: 1,
  kind,
  text,
  receivedAt: new Date(0),
  source: kind === 'speech' ? 'tcp' : 'api',
  voice: null,
  connectionId: kind === 'speech' ? 1 : null,
});

describe('logSpeechTranscript', () => {
  it('logs speech entries at debug, not markers or clears', () => {
    const events = new InProcessEventBus();
    const transcript = new MemoryLogger();
    logSpeechTranscript(events, transcript);
    events.publish({ type: 'entry', entry: entry('speech', 'Submit, button') });
    events.publish({ type: 'entry', entry: entry('marker', 'step 1') });
    events.publish({ type: 'clear' });
    expect(transcript.lines).toEqual(['debug #1 (connection 1) Submit, button']);
  });

  it('stops when the returned function is called', () => {
    const events = new InProcessEventBus();
    const transcript = new MemoryLogger();
    logSpeechTranscript(events, transcript)();
    events.publish({ type: 'entry', entry: entry('speech', 'x') });
    expect(transcript.lines).toEqual([]);
  });
});
