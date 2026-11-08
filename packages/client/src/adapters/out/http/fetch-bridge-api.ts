import {
  API_PREFIX,
  type ErrorBodyDto,
  type MarkerRequestDto,
  type SpeechEntryDto,
  type SpeechListDto,
  type StatusDto,
} from '@screenreader-speech-capture/shared';
import type { BridgeApi, SpeechPage } from '../../../application/ports/out/bridge-api.js';
import { BridgeHttpError, BridgeUnreachableError } from '../../../domain/errors.js';
import type { BridgeStatus, SpeechEntry } from '../../../domain/speech-entry.js';

/** A request that gets no answer in this time fails as unreachable (the bridge answers at once). */
const REQUEST_TIMEOUT_MS = 10_000;

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
    return toStatus(await this.json<StatusDto>('GET', '/status'));
  }

  async listSpeech(query: { since: number; limit?: number }): Promise<SpeechPage> {
    const params = new URLSearchParams({ since: String(query.since) });
    if (query.limit !== undefined) params.set('limit', String(query.limit));
    const page = await this.json<SpeechListDto>('GET', `/speech?${params.toString()}`);
    return { entries: page.entries.map(toEntry), truncated: page.truncated, hasMore: page.hasMore };
  }

  async clear(): Promise<void> {
    await this.request('DELETE', '/speech');
  }

  async mark(label: string): Promise<SpeechEntry> {
    const body: MarkerRequestDto = { label };
    return toEntry(await this.json<SpeechEntryDto>('POST', '/markers', body));
  }

  private async json<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await this.request(method, path, body)).json()) as T;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const base = await this.base();
    let response: Response;
    try {
      response = await (this.options.fetch ?? fetch)(`${base}${API_PREFIX}${path}`, {
        method,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
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

const toEntry = (dto: SpeechEntryDto): SpeechEntry => ({
  seq: dto.seq,
  kind: dto.kind,
  text: dto.text,
  receivedAt: dto.receivedAt,
  source: dto.source,
  voice: dto.voice,
  connectionId: dto.connectionId,
});

// The domain model mirrors the DTO today; the compiler checks they stay assignable.
const toStatus = (dto: StatusDto): BridgeStatus => dto;
