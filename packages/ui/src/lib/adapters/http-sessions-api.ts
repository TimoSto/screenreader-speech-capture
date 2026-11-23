import type { SessionListDto, StartSessionResponseDto } from '@screenreader-speech-capture/shared';
import type { SessionsApi } from '#lib/core/sessions.js';
import { getSessions } from '#lib/remote/sessions.remote.js';
import { routeJson, routeRequest } from './route-request.js';

/**
 * Reads the sessions with the `getSessions` remote query and changes them through the UI's own
 * sessions routes (`url` includes the base path).
 */
export class HttpSessionsApi implements SessionsApi {
  constructor(private readonly url: string) {}

  /** Always asks the server again: a query keeps its last answer while anything still uses it. */
  async list(): Promise<SessionListDto> {
    const sessions = getSessions();
    await sessions.refresh();
    return sessions.current as SessionListDto;
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
