import type { SessionDto, SessionListDto } from '@screenreader-speech-capture/shared';
import type { SessionList } from '../../../../application/ports/in/manage-sessions.js';
import type { SessionSummary } from '../../../../domain/session.js';

// The mappers list every field on purpose: a field added to the domain model doesn't reach the
// API until it is added here and to the contract.

export function toSessionDto(session: SessionSummary): SessionDto {
  return {
    id: session.id,
    name: session.name,
    run: session.run,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt?.toISOString() ?? null,
    firstSeq: session.firstSeq,
    lastSeq: session.lastSeq,
    entries: session.entries,
  };
}

export function toSessionListDto({ sessions, currentId }: SessionList): SessionListDto {
  return { sessions: sessions.map(toSessionDto), currentId };
}
