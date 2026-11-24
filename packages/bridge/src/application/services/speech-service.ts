import { API_LIMITS } from '@screenreader-speech-capture/shared';
import { invalidField } from '../../domain/errors.js';
import type { SessionFilter } from '../../domain/session.js';
import type { SpeechPage } from '../../domain/speech-buffer.js';
import type { SpeechEntry } from '../../domain/speech-entry.js';
import type { SpeechDraft, SpeechLog } from '../../domain/speech-log.js';
import type { CapturedSpeech, RecordSpeech } from '../ports/in/record-speech.js';
import {
  LIST_LIMIT,
  type ListOptions,
  type SpeechUseCases,
  type WatchListener,
  type WatchOptions,
} from '../ports/in/speech.js';
import type { Clock } from '../ports/out/clock.js';
import type { SpeechEventBus } from '../ports/out/speech-event-bus.js';
import { followLog } from '../shared/follow-log.js';
import { intOption } from '../shared/int-option.js';

interface SpeechServiceDeps {
  log: SpeechLog;
  events: SpeechEventBus;
  clock: Pick<Clock, 'now'>;
}

export const MAX_MARKER_LENGTH = API_LIMITS.markerLength;

/**
 * Recording, reading, clearing and marking speech: every entry gets its `seq` and `sessionId`
 * from the speech log and `receivedAt` from the clock, and is published on the event bus
 * (docs/implementation/tcp-capture.md#from-line-to-speech-entry).
 */
export class SpeechService implements RecordSpeech, SpeechUseCases {
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
    return followLog(this.deps, { since, sessionId, staleSince: 'replay' }, listener, options);
  }

  /** Wipes the buffer and the ended sessions, or one scope. The current session stays current. */
  clear(filter?: SessionFilter): void {
    // `active`: the current session's scope, or everything when none is current.
    const session =
      filter === 'active' ? (this.deps.log.resolveFilter(filter) ?? undefined) : filter;
    if (session === undefined) {
      this.deps.log.clear();
      this.deps.events.publish({ type: 'clear' });
      return;
    }
    this.deps.events.publish({ type: 'clear', sessionId: this.deps.log.clearScope(session) });
  }

  addMarker(label: string): SpeechEntry {
    const text = markerLabel(label);
    return this.add({ kind: 'marker', text, source: 'api', voice: null, connectionId: null });
  }

  latestMarker(label: string, session?: SessionFilter): SpeechEntry | null {
    const text = markerLabel(label);
    const sessionId = this.deps.log.resolveFilter(session);
    return this.deps.log.latestMarker(text, sessionId) ?? null;
  }

  private add(entry: Omit<SpeechDraft, 'receivedAt'>): SpeechEntry {
    const stored = this.deps.log.append({ ...entry, receivedAt: this.deps.clock.now() });
    this.deps.events.publish({ type: 'entry', entry: stored });
    return stored;
  }
}

/** A marker label: trimmed, not empty, at most `MAX_MARKER_LENGTH` characters. */
function markerLabel(label: string): string {
  const text = label.trim();
  if (text === '') throw invalidField('label', 'must not be empty');
  if (text.length > MAX_MARKER_LENGTH) {
    throw invalidField('label', `must be at most ${MAX_MARKER_LENGTH} characters`);
  }
  return text;
}
