import type { ConfigDto, ConfigResponseDto } from '@screenreader-speech-capture/shared';
import type { ConfigUpdate } from '../../../../application/ports/in/manage-config.js';
import type { Config } from '../../../../domain/config/index.js';

// Lists every field on purpose: a field added to the config (for example a secret) doesn't reach
// the API until it is added here and to the contract.

export function toConfigDto({ tcp, http, playwright, mcp, buffer, log }: Config): ConfigDto {
  return {
    tcp: {
      host: tcp.host,
      port: tcp.port,
      encoding: tcp.encoding,
      maxLineBytes: tcp.maxLineBytes,
    },
    http: { host: http.host, port: http.port, allowedHosts: [...http.allowedHosts] },
    playwright: { enabled: playwright.enabled, port: playwright.port, version: playwright.version },
    mcp: { enabled: mcp.enabled, port: mcp.port },
    buffer: { maxEntries: buffer.maxEntries },
    log: { level: log.level, file: log.file, consoleSpeech: log.consoleSpeech },
  };
}

export function toConfigResponseDto({ config, restartRequired }: ConfigUpdate): ConfigResponseDto {
  return { ...toConfigDto(config), restartRequired: [...restartRequired] };
}
