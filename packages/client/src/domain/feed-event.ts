import type { Session } from './session.js';
import type { SpeechEntry } from './speech-entry.js';

/**
 * One event of the live feed (`GET /api/v1/speech/stream`): the bridge run (first, on every
 * connection), a new entry, a clear, a session that started or ended, or `truncated` before a
 * replay when some missed entries were already dropped from the bridge's buffer.
 */
export type SpeechFeedEvent =
  | { type: 'bridge'; instanceId: string }
  | { type: 'entry'; entry: SpeechEntry }
  | { type: 'clear' }
  | { type: 'session'; session: Session }
  | { type: 'truncated' };
