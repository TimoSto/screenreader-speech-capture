import {
  checkDto,
  ConfigOverridesSchema,
  ConfigSchema,
  type ConfigDto,
  type ConfigPatchDto,
} from '@screenreader-speech-capture/shared';
import { SettingRejected, type ConfigApi, type ConfigState } from '#lib/core/config.js';

/** Reads and saves the configuration through the UI's own config route (`url` includes the base path). */
export class HttpConfigApi implements ConfigApi {
  constructor(private readonly url: string) {}

  async fetch(): Promise<ConfigState> {
    const response = await fetch(this.url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw await rejection(response);
    const body = (await response.json()) as Record<string, unknown>;
    const active = checkDto(ConfigSchema, body.active);
    const saved = checkDto(ConfigSchema, body.saved);
    const overrides = checkDto(ConfigOverridesSchema, { overrides: body.overrides });
    if (!active.ok || !saved.ok || !overrides.ok) {
      throw new Error('Unexpected configuration answer from the bridge');
    }
    return { active: active.value, saved: saved.value, overrides: overrides.value.overrides };
  }

  async update(patch: ConfigPatchDto): Promise<ConfigDto> {
    const response = await fetch(this.url, {
      method: 'PUT',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!response.ok) throw await rejection(response);
    const checked = checkDto(ConfigSchema, await response.json());
    if (!checked.ok) throw new Error(`Unexpected answer at ${checked.field}: ${checked.message}`);
    return checked.value;
  }
}

/** SvelteKit's `error()` answers `{ message, field? }`; fall back to the status. */
async function rejection(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => undefined);
  if (typeof body === 'object' && body !== null && 'message' in body) {
    const { message } = body;
    const field = 'field' in body && typeof body.field === 'string' ? body.field : undefined;
    if (typeof message === 'string') return new SettingRejected(message, field);
  }
  return new Error(`The request answered ${response.status}`);
}
