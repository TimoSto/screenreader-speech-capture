import type { SpeechApi } from '#lib/core/speech.js';

/** Changes the speech through the UI's own markers route (`url` includes the base path). */
export class HttpSpeechApi implements SpeechApi {
  constructor(private readonly url: string) {}

  async addMarker(label: string): Promise<void> {
    const response = await fetch(this.url, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ label }),
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
