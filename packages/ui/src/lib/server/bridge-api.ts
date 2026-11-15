import { error } from '@sveltejs/kit';
import {
  AnyErrorBodySchema,
  API_PREFIX,
  checkDto,
  StatusSchema,
  type DtoOf,
  type DtoSchema,
  type StatusDto,
} from '@screenreader-speech-capture/shared';

/** Where the BFF finds the bridge when `SR_BRIDGE_API_URL` is not set (`pnpm dev:ui`). */
export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:5151';

type Fetch = typeof fetch;

/** The bridge's HTTP API as the BFF uses it: the only place the UI server talks to the bridge. */
export interface BridgeApi {
  status(): Promise<StatusDto>;
}

/**
 * `baseUrl` is the bridge's origin (no path). `fetchFn` is SvelteKit's `event.fetch` in
 * routes and a fake in tests.
 */
export function createBridgeApi(baseUrl: string, fetchFn: Fetch): BridgeApi {
  const root = baseUrl.replace(/\/+$/, '') + API_PREFIX;

  async function get<S extends DtoSchema>(path: string, schema: S): Promise<DtoOf<S>> {
    let response: Response;
    try {
      response = await fetchFn(`${root}${path}`, { headers: { accept: 'application/json' } });
    } catch (cause) {
      error(502, `The bridge is not reachable: ${describe(cause)}`);
    }
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const apiError = checkDto(AnyErrorBodySchema, body);
      error(
        response.status,
        apiError.ok ? apiError.value.error.message : `The bridge answered ${response.status}`,
      );
    }
    const checked = checkDto(schema, body);
    if (!checked.ok) {
      error(502, `Unexpected answer from the bridge at ${checked.field}: ${checked.message}`);
    }
    return checked.value;
  }

  return { status: () => get('/status', StatusSchema) };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
