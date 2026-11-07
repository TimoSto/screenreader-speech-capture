import type {
  ConfigDto,
  SpeechEntryDto,
  SpeechListDto,
  StatusDto,
} from '@screenreader-speech-capture/shared';
import type { Status } from '../../../application/ports/in/get-status.js';
import type { Config } from '../../../domain/config.js';
import type { SpeechPage } from '../../../domain/speech-buffer.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';

// Maps the domain model to the API contract (packages/shared). Dates become ISO 8601 strings.

export function toSpeechEntryDto(entry: SpeechEntry): SpeechEntryDto {
  return {
    seq: entry.seq,
    kind: entry.kind,
    text: entry.text,
    receivedAt: entry.receivedAt.toISOString(),
    source: entry.source,
    voice: entry.voice,
    connectionId: entry.connectionId,
  };
}

export function toSpeechListDto(page: SpeechPage): SpeechListDto {
  return {
    entries: page.entries.map(toSpeechEntryDto),
    truncated: page.truncated,
    hasMore: page.hasMore,
  };
}

export function toStatusDto(status: Status): StatusDto {
  return {
    bridge: { ...status.bridge },
    tcp: {
      ...status.tcp,
      connections: status.tcp.connections.map((connection) => ({
        ...connection,
        connectedAt: connection.connectedAt.toISOString(),
      })),
    },
    buffer: { ...status.buffer },
    input: { ...status.input },
  };
}

export function toConfigDto(config: Config): ConfigDto {
  return {
    tcp: { ...config.tcp },
    http: { ...config.http },
    playwright: { ...config.playwright },
    mcp: { ...config.mcp },
    input: { ...config.input },
    buffer: { ...config.buffer },
    log: { ...config.log },
  };
}
