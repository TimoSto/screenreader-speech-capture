import type { SpeechEntry } from '../../domain/speech-entry.js';
import { invalidField } from '../../domain/errors.js';
import type { AddMarker } from '../ports/in/add-marker.js';
import type { ClearSpeech } from '../ports/in/clear-speech.js';
import type { QuerySpeech } from '../ports/in/query-speech.js';
import type { Clock } from '../ports/out/clock.js';
import type { IdGenerator } from '../ports/out/id-generator.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechPage, SpeechRepository } from '../ports/out/speech-repository.js';

export interface SpeechServiceDeps {
  repository: SpeechRepository;
  events: SpeechEventBus;
  clock: Clock;
  ids: IdGenerator;
}

export const MAX_MARKER_LENGTH = 1000;

/** Reading, clearing and marking the recorded speech. */
export class SpeechService implements QuerySpeech, ClearSpeech, AddMarker {
  constructor(private readonly deps: SpeechServiceDeps) {}

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
    const { repository, events, clock, ids } = this.deps;
    const entry = repository.add({
      id: ids.next(),
      kind: 'marker',
      text,
      receivedAt: clock.now(),
      monotonicMs: clock.monotonicMs(),
      source: 'api',
      voice: null,
      connectionId: null,
    });
    events.publish({ type: 'entry', entry });
    return entry;
  }
}
