import type { SessionScope } from '#lib/core/sessions.js';
import type { SpeechApi } from '#lib/core/speech.js';
import { routeRequest } from './route-request.js';

/** Changes the speech through the UI's own markers and speech routes (the urls include the base path). */
export class HttpSpeechApi implements SpeechApi {
  constructor(
    private readonly markersUrl: string,
    private readonly speechUrl: string,
  ) {}

  async addMarker(label: string): Promise<void> {
    await routeRequest(this.markersUrl, { method: 'POST', body: { label } });
  }

  async clear(scope: SessionScope): Promise<void> {
    await routeRequest(`${this.speechUrl}?session=${scope}`, { method: 'DELETE' });
  }
}
