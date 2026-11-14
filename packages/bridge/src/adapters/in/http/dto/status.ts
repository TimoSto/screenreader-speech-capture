import type { ServiceStatusDto, StatusDto } from '@screenreader-speech-capture/shared';
import type { Status } from '../../../../application/ports/in/get-status.js';
import type { ServiceName, ServiceStatus } from '../../../../domain/child-service.js';
import { toSessionDto } from './session.js';

// The mappers list every field on purpose: a field added to the domain model doesn't reach the
// API until it is added here and to the contract.

export function toServiceStatusDto(service: ServiceStatus): ServiceStatusDto {
  return {
    state: service.state,
    version: service.version,
    port: service.port,
    restarts: service.restarts,
    exitCode: service.exitCode,
  };
}

export function toStatusDto({ bridge, tcp, buffer, services, session }: Status): StatusDto {
  // Every child service is a top-level field of the API. A new `ServiceName` fails to compile
  // here until it is added, with the contract: exposing a service is an API change.
  const children = {
    playwright: toServiceStatusDto(services.playwright),
    mcp: toServiceStatusDto(services.mcp),
  } satisfies Record<ServiceName, ServiceStatusDto>;
  return {
    bridge: {
      version: bridge.version,
      apiVersion: bridge.apiVersion,
      state: bridge.state,
      startedAt: bridge.startedAt.toISOString(),
    },
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
    playwright: children.playwright,
    mcp: children.mcp,
    session: {
      current: session.current === null ? null : toSessionDto(session.current),
      count: session.count,
    },
  };
}
