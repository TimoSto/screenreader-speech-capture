import type { SessionScope } from '#lib/core/sessions.js';
import type { SpeechApi } from '#lib/core/speech.js';

/** Changes the speech through the UI's own markers and speech routes (the urls include the base path). */
export class HttpSpeechApi implements SpeechApi {
  constructor(
    private readonly markersUrl: string,
    private readonly speechUrl: string,
  ) {}

  async addMarker(label: string): Promise<void> {
    const response = await fetch(this.markersUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
    });
    if (!response.ok) throw new Error(await errorMessage(response));
  }

  async clear(scope: SessionScope): Promise<void> {
    const response = await fetch(`${this.speechUrl}?session=${encodeURIComponent(String(scope))}`, {
      method: 'DELETE',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(await errorMessage(response));
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
