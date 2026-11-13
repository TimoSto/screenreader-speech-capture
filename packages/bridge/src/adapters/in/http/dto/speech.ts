import type {
  SpeechEntryDto,
  SpeechListDto,
  WaitResultDto,
} from '@screenreader-speech-capture/shared';
import type { WaitResult } from '../../../../application/ports/in/wait-for-speech.js';
import type { SpeechPage } from '../../../../domain/speech-buffer.js';
import type { SpeechEntry } from '../../../../domain/speech-entry.js';

// Each file in dto/ maps one resource of the domain model to the API contract (packages/shared).
// Dates become ISO 8601 strings.

export function toSpeechEntryDto(entry: SpeechEntry): SpeechEntryDto {
  return {
    seq: entry.seq,
    kind: entry.kind,
    text: entry.text,
    receivedAt: entry.receivedAt.toISOString(),
    source: entry.source,
    voice: entry.voice,
    connectionId: entry.connectionId,
    sessionId: entry.sessionId,
  };
}

export function toSpeechListDto(page: SpeechPage, instanceId: string): SpeechListDto {
  return {
    entries: page.entries.map(toSpeechEntryDto),
    truncated: page.truncated,
    hasMore: page.hasMore,
    instanceId,
  };
}

export function toWaitResultDto(result: WaitResult): WaitResultDto {
  return result.status === 'matched'
    ? { matched: true, entry: toSpeechEntryDto(result.entry) }
    : { matched: false, entries: result.seen.map(toSpeechEntryDto) };
}
