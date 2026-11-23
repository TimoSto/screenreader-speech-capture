import { checkDto, type DtoOf, type DtoSchema } from '@screenreader-speech-capture/shared';

/** What the UI's own routes answer on an error: SvelteKit's `error()` body (`App.Error`). */
export interface RouteError {
  message: string;
  /** The setting a rejected config update is about (`tcp.port`). */
  field: string | undefined;
}

export interface RouteRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Sent as JSON. */
  body?: unknown;
  signal?: AbortSignal;
  /**
   * The error a refused request rejects with. `error` is `null` when the answer is not a
   * SvelteKit error body. By default: an `Error` with the route's message, or with the status.
   */
  rejection?: (error: RouteError | null, status: number) => Error;
}

const defaultRejection = (error: RouteError | null, status: number): Error =>
  new Error(error?.message ?? `The request answered ${status}`);

/** Calls one of the UI's own routes (`url` includes the base path) and rejects unless it is ok. */
export async function routeRequest(
  url: string,
  { method = 'GET', body, signal, rejection = defaultRejection }: RouteRequest = {},
): Promise<Response> {
  const response = await fetch(url, {
    method,
    headers: {
      accept: 'application/json',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw rejection(await readRouteError(response), response.status);
  return response;
}

/** {@link routeRequest} for an answer that must match `schema`. */
export async function routeDto<S extends DtoSchema>(
  url: string,
  schema: S,
  request?: RouteRequest,
): Promise<DtoOf<S>> {
  const response = await routeRequest(url, request);
  const checked = checkDto(schema, await response.json());
  if (!checked.ok) throw new Error(`Unexpected answer at ${checked.field}: ${checked.message}`);
  return checked.value;
}

async function readRouteError(response: Response): Promise<RouteError | null> {
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body !== 'object' || body === null || !('message' in body)) return null;
  const { message } = body;
  if (typeof message !== 'string') return null;
  const field = 'field' in body && typeof body.field === 'string' ? body.field : undefined;
  return { message, field };
}
