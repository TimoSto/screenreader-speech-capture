import type { SessionListDto, StartSessionResponseDto } from '@screenreader-speech-capture/shared';
import type { SessionsApi } from '#lib/core/sessions.js';
import { routeJson, routeRequest } from './route-request.js';

/** Reads and changes sessions through the UI's own sessions routes (`url` includes the base path). */
export class HttpSessionsApi implements SessionsApi {
  constructor(private readonly url: string) {}

  list(): Promise<SessionListDto> {
    return routeJson<SessionListDto>(this.url);
  }

  start(name: string, run: string | null): Promise<StartSessionResponseDto> {
    return routeJson<StartSessionResponseDto>(this.url, { method: 'POST', body: { name, run } });
  }

  async end(): Promise<void> {
    await routeRequest(`${this.url}/end`, { method: 'POST' });
  }

  async delete(id: number): Promise<void> {
    await routeRequest(`${this.url}/${id}`, { method: 'DELETE' });
  }
}
