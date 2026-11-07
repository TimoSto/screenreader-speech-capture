import type { SpeechPage } from '../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../domain/speech-entry.js';
import { invalidField } from '../../domain/errors.js';
import type { AddMarker } from '../ports/in/add-marker.js';
import type { ClearSpeech } from '../ports/in/clear-speech.js';
import type { QuerySpeech } from '../ports/in/query-speech.js';
import type { CapturedSpeech, RecordSpeech } from '../ports/in/record-speech.js';
import type { Clock } from '../ports/out/clock.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';

export interface SpeechServiceDeps {
  repository: SpeechRepository;
  events: SpeechEventBus;
  clock: Clock;
}

export const MAX_MARKER_LENGTH = 1000;

/**
 * Recording, reading, clearing and marking speech: every entry gets its `seq` from the repository
 * and `receivedAt` from the clock, and is published on the event bus
 * (docs/speech-capture.md#from-line-to-speech-entry).
 */
export class SpeechService implements RecordSpeech, QuerySpeech, ClearSpeech, AddMarker {
  constructor(private readonly deps: SpeechServiceDeps) {}

  record({ text, voice, connectionId }: CapturedSpeech): void {
    this.add({ kind: 'speech', text, source: 'tcp', voice, connectionId });
  }

  list(options: { since: number; limit: number }): SpeechPage {
    return this.deps.repository.list(options.since, options.limit);
  }

  clear(): void {
    this.deps.repository.clear();
    this.deps.events.publish({ type: 'clear' });
  }

  addMarker(label: string): SpeechEntry {
    const text = label.trim();
    if (text === '') throw invalidField('label', 'must not be empty');
    if (text.length > MAX_MARKER_LENGTH) {
      throw invalidField('label', `must be at most ${MAX_MARKER_LENGTH} characters`);
    }
    return this.add({ kind: 'marker', text, source: 'api', voice: null, connectionId: null });
  }

  private add(entry: Omit<NewSpeechEntry, 'receivedAt'>): SpeechEntry {
    const stored = this.deps.repository.add({ ...entry, receivedAt: this.deps.clock.now() });
    this.deps.events.publish({ type: 'entry', entry: stored });
    return stored;
  }
}
