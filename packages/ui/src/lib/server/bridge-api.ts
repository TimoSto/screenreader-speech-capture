import { error } from '@sveltejs/kit';
import {
  AnyErrorBodySchema,
  API_PREFIX,
  CLIENT_HEADER,
  checkDto,
  SessionListSchema,
  StartSessionResponseSchema,
  StatusSchema,
  type DtoOf,
  type DtoSchema,
  type SessionListDto,
  type StartSessionRequestDto,
  type StartSessionResponseDto,
  type StatusDto,
} from '@screenreader-speech-capture/shared';

/** Where the BFF finds the bridge when `SR_BRIDGE_API_URL` is not set (`pnpm dev:ui`). */
export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5151';

type Fetch = typeof fetch;

/** The bridge's HTTP API as the BFF uses it: the only place the UI server talks to the bridge. */
export interface BridgeApi {
  status(): Promise<StatusDto>;
  sessions(): Promise<SessionListDto>;
  startSession(request: StartSessionRequestDto): Promise<StartSessionResponseDto>;
  /** Ends the current session; does nothing if none is current. */
  endSession(): Promise<void>;
}

/** Named in the bridge's logs when this UI ends or replaces another client's session. */
const UI_CLIENT = 'web-ui';

/**
 * `baseUrl` is the bridge's origin (no path). `fetchFn` is SvelteKit's `event.fetch` in
 * routes and a fake in tests.
 */
export function createBridgeApi(baseUrl: string, fetchFn: Fetch): BridgeApi {
  const root = baseUrl.replace(/\/+$/, '') + API_PREFIX;

  async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, {
        method,
        headers: {
          accept: 'application/json',
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
      error(
        response.status,
        apiError.ok ? apiError.value.error.message : `The bridge answered ${response.status}`,
      );
    }
    return answer;
  }

  async function read<S extends DtoSchema>(
    method: 'GET' | 'POST',
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
  };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** The bridge API of this deployment (read per request, so no SvelteKit env module is needed). */
export function bridgeApiFromEnv(fetchFn: Fetch): BridgeApi {
  // The bridge sets SR_BRIDGE_API_URL to its own address when it mounts the UI.
  return createBridgeApi(process.env.SR_BRIDGE_API_URL ?? DEFAULT_BRIDGE_URL, fetchFn);
}
