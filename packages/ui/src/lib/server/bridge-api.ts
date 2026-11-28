import { error } from '@sveltejs/kit';
import {
  AnyErrorBodySchema,
  API_PREFIX,
  CLIENT_HEADER,
  checkDto,
  ConfigOverridesSchema,
  ConfigSchema,
  SessionListSchema,
  SpeechEntrySchema,
  SpeechListSchema,
  StartSessionResponseSchema,
  StatusSchema,
  type ConfigDto,
  type ConfigOverridesDto,
  type ConfigPatchDto,
  type DtoOf,
  type DtoSchema,
  type KeysRequestDto,
  type SessionListDto,
  type SpeechEntryDto,
  type SpeechListDto,
  type StartSessionRequestDto,
  type StartSessionResponseDto,
  type StatusDto,
} from '@screenreader-speech-capture/shared';
import type { SessionScope } from '#lib/core/sessions.js';

type Fetch = typeof fetch;

/** The bridge's HTTP API as the BFF uses it: the only place the UI server talks to the bridge. */
export interface BridgeApi {
  status(): Promise<StatusDto>;
  sessions(): Promise<SessionListDto>;
  startSession(request: StartSessionRequestDto): Promise<StartSessionResponseDto>;
  /** Ends the current session; does nothing if none is current. */
  endSession(): Promise<void>;
  /** Deletes an ended session and its speech (the bridge refuses the current one). */
  deleteSession(id: number): Promise<void>;
  /** Clears the speech of the current session or of `none` (`session`: an id or `none`); it keeps running. */
  clearSpeech(session: SessionScope): Promise<void>;
  /** The configuration in use (`active`) or the one the next start will use (`saved`). */
  config(view: 'active' | 'saved'): Promise<ConfigDto>;
  /** The settings a flag or environment variable sets: the config file can't change them. */
  configOverrides(): Promise<ConfigOverridesDto>;
  /**
   * Saves a partial config for the next start and answers with the saved config. Rejects with the
   * bridge's status and message, plus `field` (`tcp.port`) when the bridge names one.
   */
  updateConfig(patch: ConfigPatchDto): Promise<ConfigDto>;
  /** Presses keys in the foreground window of the bridge's machine. */
  pressKeys(keys: KeysRequestDto['keys']): Promise<void>;
  /** Inserts a marker; the bridge files it under the current session (or outside any). */
  addMarker(label: string): Promise<SpeechEntryDto>;
  /** One page of a scope's entries with `seq > since`, oldest first (`session`: an id or `none`). */
  speech(session: SessionScope | null, since: number, limit: number): Promise<SpeechListDto>;
  /**
   * Opens the bridge's SSE stream (`session`: an id or `none`). The body is passed on as it is,
   * so `Last-Event-ID` replays and every event name reach the browser untouched.
   */
  openSpeechStream(
    session: SessionScope | null,
    lastEventId: string | null,
    signal: AbortSignal,
  ): Promise<Response>;
}

/** Named in the bridge's logs when this UI ends or replaces another client's session. */
const UI_CLIENT = 'web-ui';

/**
 * `baseUrl` is the bridge's origin (no path). `fetchFn` is SvelteKit's `event.fetch` in
 * routes and a fake in tests.
 */
export function createBridgeApi(baseUrl: string, fetchFn: Fetch): BridgeApi {
  const root = baseUrl.replace(/\/+$/, '') + API_PREFIX;
  // SvelteKit's `event.fetch` adds `Origin: <the UI's own origin>` to every call to another origin
  // (`pnpm dev:ui`: http://localhost:5173). The bridge refuses a POST from any origin but its own
  // (docs/usage/security.md#host-and-origin), so name the bridge itself: this is a server-side
  // call, not a page of another site.
  const origin = new URL(root).origin;

  async function call(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          origin,
          [CLIENT_HEADER]: UI_CLIENT,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (cause) {
      error(502, `The bridge is not reachable: ${describe(cause)}`);
    }
    const answer: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const apiError = checkDto(AnyErrorBodySchema, answer);
      if (!apiError.ok) error(response.status, `The bridge answered ${response.status}`);
      const { message, details } = apiError.value.error;
      const field = details?.field;
      if (typeof field === 'string') error(response.status, { message, field });
      error(response.status, message);
    }
    return answer;
  }

  async function read<S extends DtoSchema>(
    method: 'GET' | 'POST' | 'PUT',
    path: string,
    schema: S,
    body?: unknown,
  ): Promise<DtoOf<S>> {
    const checked = checkDto(schema, await call(method, path, body));
    if (!checked.ok) {
      error(502, `Unexpected answer from the bridge at ${checked.field}: ${checked.message}`);
    }
    return checked.value;
  }

  return {
    status: () => read('GET', '/status', StatusSchema),
    sessions: () => read('GET', '/sessions', SessionListSchema),
    startSession: (request) => read('POST', '/sessions', StartSessionResponseSchema, request),
    endSession: async () => {
      await call('POST', '/sessions/end');
    },
    deleteSession: async (id) => {
      await call('DELETE', `/sessions?session=${id}`);
    },
    clearSpeech: async (session) => {
      await call('DELETE', `/speech?session=${session}`);
    },
    config: (view) => read('GET', `/config?view=${view}`, ConfigSchema),
    configOverrides: () => read('GET', '/config/overrides', ConfigOverridesSchema),
    updateConfig: (patch) => read('PUT', '/config', ConfigSchema, patch),
    pressKeys: async (keys) => {
      await call('POST', '/input/keys', { keys });
    },
    addMarker: (label) => read('POST', '/markers', SpeechEntrySchema, { label }),
    speech: (session, since, limit) => {
      const query = new URLSearchParams({ since: String(since), limit: String(limit) });
      if (session !== null) query.set('session', String(session));
      return read('GET', `/speech?${query}`, SpeechListSchema);
    },
    openSpeechStream: async (session, lastEventId, signal) => {
      const query = session === null ? '' : `?session=${session}`;
      let response: Response;
      try {
        response = await fetchFn(`${root}/speech/stream${query}`, {
          headers: {
            accept: 'text/event-stream',
            origin,
            [CLIENT_HEADER]: UI_CLIENT,
            ...(lastEventId === null ? {} : { 'last-event-id': lastEventId }),
          },
          signal,
        });
      } catch (cause) {
        error(502, `The bridge is not reachable: ${describe(cause)}`);
      }
      if (!response.ok || response.body === null) {
        // Unread, the body would hold the bridge connection until it is garbage collected, and
        // `EventSource` retries every few seconds while the bridge refuses.
        await response.body?.cancel().catch(() => undefined);
        error(
          response.status === 200 ? 502 : response.status,
          'The speech stream is not available',
        );
      }
      return response;
    },
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
