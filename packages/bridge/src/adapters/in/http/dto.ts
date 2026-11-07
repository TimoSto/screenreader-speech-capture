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

// The mappers below list every field on purpose: a field added to the domain model doesn't reach
// the API (for example a secret in the config) until it is added here and to the contract.

export function toStatusDto({ bridge, tcp, buffer, input }: Status): StatusDto {
  return {
    bridge: { version: bridge.version, apiVersion: bridge.apiVersion, state: bridge.state },
    tcp: {
      listening: tcp.listening,
      host: tcp.host,
      port: tcp.port,
      encoding: tcp.encoding,
      connections: tcp.connections.map(({ id, voice, connectedAt }) => ({
        id,
        voice,
        connectedAt: connectedAt.toISOString(),
      })),
    },
    buffer: {
      size: buffer.size,
      maxEntries: buffer.maxEntries,
      firstSeq: buffer.firstSeq,
      lastSeq: buffer.lastSeq,
    },
    input: { enabled: input.enabled },
  };
}

export function toConfigDto({ tcp, http, playwright, mcp, input, buffer, log }: Config): ConfigDto {
  return {
    tcp: {
      host: tcp.host,
      port: tcp.port,
      format: tcp.format,
      encoding: tcp.encoding,
      maxLineBytes: tcp.maxLineBytes,
    },
    http: { host: http.host, port: http.port },
    playwright: { enabled: playwright.enabled, port: playwright.port, version: playwright.version },
    mcp: { enabled: mcp.enabled, port: mcp.port, version: mcp.version },
    input: { enabled: input.enabled },
    buffer: { maxEntries: buffer.maxEntries },
    log: { level: log.level, file: log.file, consoleSpeech: log.consoleSpeech },
  };
}
