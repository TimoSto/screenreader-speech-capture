import {
  checkDto,
  SessionListSchema,
  StartSessionResponseSchema,
  type DtoOf,
  type DtoSchema,
  type SessionListDto,
  type StartSessionResponseDto,
} from '@screenreader-speech-capture/shared';
import type { SessionsApi } from '#lib/core/sessions.js';

/** Reads and changes sessions through the UI's own sessions routes (`url` includes the base path). */
export class HttpSessionsApi implements SessionsApi {
  constructor(private readonly url: string) {}

  list(): Promise<SessionListDto> {
    return this.send('GET', this.url, undefined, SessionListSchema);
  }

  start(name: string, run: string | null): Promise<StartSessionResponseDto> {
    return this.send('POST', this.url, { name, run }, StartSessionResponseSchema);
  }

  async end(): Promise<void> {
    await this.send('POST', `${this.url}/end`, undefined, undefined);
  }

  async delete(id: number): Promise<void> {
    await this.send('DELETE', `${this.url}/${id}`, undefined, undefined);
  }

  private async send<S extends DtoSchema>(
    method: 'GET' | 'POST' | 'DELETE',
    url: string,
    body: unknown,
    schema: S | undefined,
  ): Promise<DtoOf<S>> {
    const response = await fetch(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    if (schema === undefined) return undefined;
    const checked = checkDto(schema, await response.json());
    if (!checked.ok) throw new Error(`Unexpected answer at ${checked.field}: ${checked.message}`);
    return checked.value;
  }
}

/** SvelteKit's `error()` answers `{ message }`; fall back to the status. */
async function errorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body;
    if (typeof message === 'string') return message;
  }
  return `The request answered ${response.status}`;
}
