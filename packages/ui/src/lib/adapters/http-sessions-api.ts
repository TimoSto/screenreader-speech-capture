import {
  SessionListSchema,
  StartSessionResponseSchema,
  type SessionListDto,
  type StartSessionResponseDto,
} from '@screenreader-speech-capture/shared';
import type { SessionsApi } from '#lib/core/sessions.js';
import { routeDto, routeRequest } from './route-request.js';

/** Reads and changes sessions through the UI's own sessions routes (`url` includes the base path). */
export class HttpSessionsApi implements SessionsApi {
  constructor(private readonly url: string) {}

  list(): Promise<SessionListDto> {
    return routeDto(this.url, SessionListSchema);
  }

  start(name: string, run: string | null): Promise<StartSessionResponseDto> {
    return routeDto(this.url, StartSessionResponseSchema, { method: 'POST', body: { name, run } });
  }

  async end(): Promise<void> {
    await routeRequest(`${this.url}/end`, { method: 'POST' });
  }

  async delete(id: number): Promise<void> {
    await routeRequest(`${this.url}/${id}`, { method: 'DELETE' });
  }
}
