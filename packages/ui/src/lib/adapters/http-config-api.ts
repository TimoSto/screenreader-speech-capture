import {
  checkDto,
  ConfigOverridesSchema,
  ConfigSchema,
  type ConfigDto,
  type ConfigPatchDto,
} from '@screenreader-speech-capture/shared';
import { SettingRejected, type ConfigApi, type ConfigState } from '#lib/core/config.js';
import { routeDto, routeRequest, type RouteError } from './route-request.js';

/** A refused save names the bridge's reason (and the setting, when it names one). */
const rejection = (error: RouteError | null, status: number): Error =>
  error === null
    ? new Error(`The request answered ${status}`)
    : new SettingRejected(error.message, error.field);

/** Reads and saves the configuration through the UI's own config route (`url` includes the base path). */
export class HttpConfigApi implements ConfigApi {
  constructor(private readonly url: string) {}

  async fetch(): Promise<ConfigState> {
    const response = await routeRequest(this.url, { rejection });
    const body = (await response.json()) as Record<string, unknown>;
    const active = checkDto(ConfigSchema, body.active);
    const saved = checkDto(ConfigSchema, body.saved);
    const overrides = checkDto(ConfigOverridesSchema, { overrides: body.overrides });
    if (!active.ok || !saved.ok || !overrides.ok) {
      throw new Error('Unexpected configuration answer from the bridge');
    }
    return { active: active.value, saved: saved.value, overrides: overrides.value.overrides };
  }

  update(patch: ConfigPatchDto): Promise<ConfigDto> {
    return routeDto(this.url, ConfigSchema, { method: 'PUT', body: patch, rejection });
  }
}
