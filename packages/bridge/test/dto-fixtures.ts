// Domain objects for the HTTP DTO tests (src/adapters/in/http/dto/*.test.ts).
import type { SessionSummary } from '../src/domain/session.js';
import type { SpeechEntry } from '../src/domain/speech-entry.js';

export const AT = new Date('2026-11-12T09:00:00.000Z');
export const AT_ISO = '2026-11-12T09:00:00.000Z';

export const entry: SpeechEntry = {
  seq: 4,
  kind: 'speech',
  text: 'OK button',
  receivedAt: AT,
  source: 'tcp',
  voice: 'eloquence',
  connectionId: 2,
  sessionId: 1,
};

export const session = (endedAt: Date | null = null): SessionSummary => ({
  id: 1,
  name: 'checkout',
  run: 'nightly',
  startedAt: AT,
  endedAt,
  startSeq: 2,
  firstSeq: 3,
  lastSeq: 4,
  entries: 2,
});
