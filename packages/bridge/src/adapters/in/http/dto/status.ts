import type {
  InputAvailabilityDto,
  ServiceStatusDto,
  StatusDto,
} from '@screenreader-speech-capture/shared';
import type { Status } from '../../../../application/ports/in/get-status.js';
import type { Availability } from '../../../../domain/availability.js';
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

export function toInputAvailabilityDto(availability: Availability): InputAvailabilityDto {
  return availability.available
    ? { available: true, backend: availability.backend, reason: null }
    : { available: false, backend: null, reason: availability.reason };
}

export function toStatusDto({ bridge, tcp, buffer, services, session, input }: Status): StatusDto {
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
    input: {
      native: toInputAvailabilityDto(input.native),
      focus: toInputAvailabilityDto(input.focus),
    },
  };
}
