import {
  API_PREFIX,
  API_VERSION,
  type ErrorBodyDto,
  type MarkerRequestDto,
  type ServiceStatusDto,
  type SessionDto,
  type SessionListDto,
  type SpeechEntryDto,
  type StartSessionRequestDto,
  type SpeechListDto,
  type StatusDto,
} from '@screenreader-speech-capture/shared';
import type { BridgeApi, SpeechPage } from '../../../application/ports/out/bridge-api.js';
import { checkApiVersion } from '../../../domain/api-version.js';
import { BridgeHttpError, BridgeUnreachableError } from '../../../domain/errors.js';
import type { BridgeStatus, ServiceStatus } from '../../../domain/bridge-status.js';
import type { SpeechFeedEvent } from '../../../domain/feed-event.js';
import type { Session, SessionList, SessionRef } from '../../../domain/session.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import { parseSse } from './sse-parser.js';

/** A request that gets no answer in this time fails as unreachable (the bridge answers at once). */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * The live feed counts as dead after this long without a byte: the bridge sends a `: ping`
 * every 15 s, so this is three missed pings (a half-open connection never reports an error).
 */
const STREAM_IDLE_MS = 45_000;

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  /** Replaces the default timeout. */
  signal?: AbortSignal;
}

export interface FetchBridgeApiOptions {
  /** Resolves the bridge URL (no trailing slash). Called once, on the first request. */
  baseUrl: () => Promise<string>;
  fetch?: typeof fetch;
}

/** {@link BridgeApi} over `fetch` (docs/http-api.md). */
export class FetchBridgeApi implements BridgeApi {
  #baseUrl: Promise<string> | undefined;

  constructor(private readonly options: FetchBridgeApiOptions) {}

  async status(): Promise<BridgeStatus> {
    const dto = await this.json<StatusDto>('GET', '/status');
    // Checked before mapping: another major version may answer in another shape.
    checkApiVersion(dto.bridge.apiVersion, API_VERSION);
    return toStatus(dto);
  }

  async listSpeech(query: {
    since: number;
    limit?: number;
    session?: SessionRef;
  }): Promise<SpeechPage> {
    const params = new URLSearchParams({ since: String(query.since) });
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    if (query.session !== undefined) params.set('session', String(query.session));
    const page = await this.json<SpeechListDto>('GET', `/speech?${params.toString()}`);
    return {
      entries: page.entries.map(toEntry),
      truncated: page.truncated,
      hasMore: page.hasMore,
    };
  }

  async clear(): Promise<void> {
    await this.request('DELETE', '/speech');
  }

  async mark(label: string): Promise<SpeechEntry> {
    const body: MarkerRequestDto = { label };
    return toEntry(await this.json<SpeechEntryDto>('POST', '/markers', { body }));
  }

  async startSession(request: { name: string; run?: string | undefined }): Promise<Session> {
    const body: StartSessionRequestDto = {
      name: request.name,
      ...(request.run === undefined ? {} : { run: request.run }),
    };
    return toSession(await this.json<SessionDto>('POST', '/sessions', { body }));
  }

  async endSession(): Promise<void> {
    await this.request('POST', '/sessions/end');
  }

  async listSessions(): Promise<SessionList> {
    const list = await this.json<SessionListDto>('GET', '/sessions');
    return { sessions: list.sessions.map(toSession), currentId: list.currentId };
  }

  async *streamSpeech(options: {
    lastEventId: number | null;
    session?: number | undefined;
    signal: AbortSignal;
  }): AsyncGenerator<SpeechFeedEvent> {
    const { lastEventId, session, signal } = options;
    // Aborted by the caller, or by the watchdog when the bridge stays silent.
    const controller = new AbortController();
    const close = () => controller.abort(signal.reason);
    signal.addEventListener('abort', close, { once: true });
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const watch = (ms: number, reason: string) => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => controller.abort(new Error(reason)), ms);
    };
    try {
      watch(REQUEST_TIMEOUT_MS, `no answer within ${REQUEST_TIMEOUT_MS} ms`);
      const query = session === undefined ? '' : `?session=${session}`;
      const response = await this.request('GET', `/speech/stream${query}`, {
        headers: {
          accept: 'text/event-stream',
          ...(lastEventId === null ? {} : { 'last-event-id': String(lastEventId) }),
        },
        signal: controller.signal,
      });
      if (!response.body) return;
      const text = response.body.pipeThrough(new TextDecoderStream());
      async function* watched(): AsyncGenerator<string> {
        watch(STREAM_IDLE_MS, `no data for ${STREAM_IDLE_MS} ms`);
        for await (const chunk of text) {
          watch(STREAM_IDLE_MS, `no data for ${STREAM_IDLE_MS} ms`);
          yield chunk;
        }
      }
      for await (const message of parseSse(watched())) {
        const event = toFeedEvent(message.event, message.data);
        if (event) yield event;
      }
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof BridgeUnreachableError || error instanceof BridgeHttpError) throw error;
      const cause: unknown = controller.signal.aborted ? controller.signal.reason : error;
      throw new BridgeUnreachableError(await this.base(), { cause });
    } finally {
      clearTimeout(watchdog);
      signal.removeEventListener('abort', close);
      // Closes the connection when the consumer stops early.
      controller.abort();
    }
  }

  private async json<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
    return (await (await this.request(method, path, options)).json()) as T;
  }

  private async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Response> {
    const base = await this.base();
    const { body } = options;
    const headers = {
      ...options.headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    };
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(`${base}${API_PREFIX}${path}`, {
        method,
        signal: options.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw new BridgeUnreachableError(base, { cause: error });
    }
    if (!response.ok) throw await toHttpError(response);
    return response;
  }

  private base(): Promise<string> {
    this.#baseUrl ??= this.options.baseUrl().catch((error: unknown) => {
      this.#baseUrl = undefined;
      throw error;
    });
    return this.#baseUrl;
  }
}

async function toHttpError(response: Response): Promise<BridgeHttpError> {
  try {
    const { error } = (await response.json()) as ErrorBodyDto;
    return new BridgeHttpError(response.status, error.code, error.message, error.details);
  } catch {
    // Not the bridge's error format, for example a proxy in between.
    return new BridgeHttpError(response.status, 'HTTP_ERROR', response.statusText);
  }
}

/** The feed event for one SSE message, `undefined` for events this client doesn't know. */
function toFeedEvent(event: string, data: string): SpeechFeedEvent | undefined {
  switch (event) {
    case 'entry':
      return { type: 'entry', entry: toEntry(JSON.parse(data) as SpeechEntryDto) };
    case 'session':
      return { type: 'session', session: toSession(JSON.parse(data) as SessionDto) };
    case 'clear':
    case 'truncated':
      return { type: event };
    default:
      // New event types may come in minor API versions.
      return undefined;
  }
}

const toEntry = (dto: SpeechEntryDto): SpeechEntry => ({
  seq: dto.seq,
  kind: dto.kind,
  text: dto.text,
  receivedAt: dto.receivedAt,
  source: dto.source,
  voice: dto.voice,
  connectionId: dto.connectionId,
  sessionId: dto.sessionId ?? null,
});

// Field by field, so a field the domain model gains without a DTO source is a compile error.
const toSession = (dto: SessionDto): Session => ({
  id: dto.id,
  name: dto.name,
  run: dto.run,
  startedAt: dto.startedAt,
  endedAt: dto.endedAt,
  firstSeq: dto.firstSeq,
  lastSeq: dto.lastSeq,
  entries: dto.entries,
});

const toServiceStatus = (dto: ServiceStatusDto): ServiceStatus => ({
  state: dto.state,
  version: dto.version,
  port: dto.port,
  restarts: dto.restarts,
  exitCode: dto.exitCode,
});

const toStatus = ({ bridge, tcp, buffer, playwright, mcp, session }: StatusDto): BridgeStatus => ({
  bridge: {
    version: bridge.version,
    apiVersion: bridge.apiVersion,
    state: bridge.state,
    startedAt: bridge.startedAt,
  },
  tcp: {
    listening: tcp.listening,
    host: tcp.host,
    port: tcp.port,
    encoding: tcp.encoding,
    connections: tcp.connections.map(({ id, voice, connectedAt }) => ({ id, voice, connectedAt })),
  },
  buffer: {
    size: buffer.size,
    maxEntries: buffer.maxEntries,
    firstSeq: buffer.firstSeq,
    lastSeq: buffer.lastSeq,
  },
  playwright: toServiceStatus(playwright),
  mcp: toServiceStatus(mcp),
  session: {
    current: session.current === null ? null : toSession(session.current),
    count: session.count,
  },
});
