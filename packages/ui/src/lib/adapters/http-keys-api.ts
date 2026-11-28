import type { KeysApi } from '#lib/core/setup.js';
import { routeRequest } from './route-request.js';

/** Sends key presses through the UI's own route (`url` includes the base path). */
export class HttpKeysApi implements KeysApi {
  constructor(private readonly url: string) {}

  async press(keys: string): Promise<void> {
    await routeRequest(this.url, { method: 'POST', body: { keys } });
  }
}
