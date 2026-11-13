import type { SpeechPage } from '../../domain/speech-buffer.js';
import type { NewSpeechEntry, SpeechEntry } from '../../domain/speech-entry.js';
import { invalidField } from '../../domain/errors.js';
import type { AddMarker } from '../ports/in/add-marker.js';
import type { ClearSpeech } from '../ports/in/clear-speech.js';
import { LIST_LIMIT, type ListOptions, type QuerySpeech } from '../ports/in/query-speech.js';
import type { CapturedSpeech, RecordSpeech } from '../ports/in/record-speech.js';
import type { WatchListener, WatchOptions, WatchSpeech } from '../ports/in/watch-speech.js';
import type { Clock } from '../ports/out/clock.js';
import type { SessionRepository } from '../ports/out/session-repository.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import type { SpeechRepository } from '../ports/out/speech-repository.js';
import { intOption } from '../shared/int-option.js';
import { resolveSessionFilter } from '../shared/session-filter.js';

export interface SpeechServiceDeps {
  repository: SpeechRepository;
  events: SpeechEventBus;
  clock: Clock;
  sessions: SessionRepository;
}

export const MAX_MARKER_LENGTH = 1000;

/**
 * Recording, reading, clearing and marking speech: every entry gets its `seq` from the repository
 * and `receivedAt` from the clock, its `sessionId` from the current session, and is published on
 * the event bus
 * (docs/speech-capture.md#from-line-to-speech-entry).
 */
export class SpeechService
  implements RecordSpeech, QuerySpeech, ClearSpeech, AddMarker, WatchSpeech
{
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
    const sessionId = resolveSessionFilter(options.session, this.deps.sessions);
    return this.deps.repository.list(since, limit, sessionId);
  }

  watch(since: number | null, listener: WatchListener, options: WatchOptions = {}): () => void {
    const sessionId = resolveSessionFilter(options.session, this.deps.sessions);
    // Replay and subscription in one synchronous block: nothing is missed or sent twice.
    if (since !== null) {
      const { entries, truncated } = this.deps.repository.list(since, undefined, sessionId);
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
    this.deps.repository.clear();
    this.deps.sessions.removeEnded(() => false);
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

  private add(entry: Omit<NewSpeechEntry, 'receivedAt' | 'sessionId'>): SpeechEntry {
    const stored = this.deps.repository.add({
      ...entry,
      receivedAt: this.deps.clock.now(),
      sessionId: this.deps.sessions.current()?.id ?? null,
    });
    this.deps.events.publish({ type: 'entry', entry: stored });
    return stored;
  }
}
