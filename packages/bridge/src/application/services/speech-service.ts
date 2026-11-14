import { invalidField } from '../../domain/errors.js';
import type { SpeechPage } from '../../domain/speech-buffer.js';
import type { SpeechEntry } from '../../domain/speech-entry.js';
import type { SpeechDraft, SpeechLog } from '../../domain/speech-log.js';
import type { CapturedSpeech, RecordSpeech } from '../ports/in/record-speech.js';
import {
  LIST_LIMIT,
  type ListOptions,
  type ResizeBuffer,
  type SpeechUseCases,
  type WatchListener,
  type WatchOptions,
} from '../ports/in/speech.js';
import type { Clock } from '../ports/out/clock.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import { intOption } from '../shared/int-option.js';

export interface SpeechServiceDeps {
  log: SpeechLog;
  events: SpeechEventBus;
  clock: Clock;
}

export const MAX_MARKER_LENGTH = 1000;

/**
 * Recording, reading, clearing and marking speech: every entry gets its `seq` and `sessionId`
 * from the speech log and `receivedAt` from the clock, and is published on the event bus
 * (docs/speech-capture.md#from-line-to-speech-entry).
 */
export class SpeechService implements RecordSpeech, SpeechUseCases, ResizeBuffer {
  constructor(private readonly deps: SpeechServiceDeps) {}

  record({ text, voice, connectionId }: CapturedSpeech): void {
    this.add({ kind: 'speech', text, source: 'tcp', voice, connectionId });
  }

  list(options: ListOptions = {}): SpeechPage {
    const since = intOption('since', options.since, {
      fallback: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
    });
    const limit = intOption('limit', options.limit, {
      fallback: LIST_LIMIT.default,
      min: 1,
      max: LIST_LIMIT.max,
    });
    const sessionId = this.deps.log.resolveFilter(options.session);
    return this.deps.log.page(since, limit, sessionId);
  }

  watch(since: number | null, listener: WatchListener, options: WatchOptions = {}): () => void {
    const sessionId = this.deps.log.resolveFilter(options.session);
    // Replay and subscription in one synchronous block: nothing is missed or sent twice.
    if (since !== null) {
      const { entries, truncated } = this.deps.log.page(since, undefined, sessionId);
      if (truncated) listener({ type: 'truncated' });
      for (const entry of entries) listener({ type: 'entry', entry });
    }
    if (sessionId === undefined) return this.deps.events.subscribe(listener);
    return this.deps.events.subscribe((event) => {
      if (event.type !== 'entry' || event.entry.sessionId === sessionId) listener(event);
    });
  }

  /** Wipes the buffer and the ended sessions. The current session stays current. */
  clear(): void {
    this.deps.log.clear();
    this.deps.events.publish({ type: 'clear' });
  }

  setMaxEntries(maxEntries: number): void {
    this.deps.log.resize(maxEntries);
  }

  addMarker(label: string): SpeechEntry {
    const text = label.trim();
    if (text === '') throw invalidField('label', 'must not be empty');
    if (text.length > MAX_MARKER_LENGTH) {
      throw invalidField('label', `must be at most ${MAX_MARKER_LENGTH} characters`);
    }
    return this.add({ kind: 'marker', text, source: 'api', voice: null, connectionId: null });
  }

  private add(entry: Omit<SpeechDraft, 'receivedAt'>): SpeechEntry {
    const stored = this.deps.log.append({ ...entry, receivedAt: this.deps.clock.now() });
    this.deps.events.publish({ type: 'entry', entry: stored });
    return stored;
  }
}
