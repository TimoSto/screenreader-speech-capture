import type { ConfigDto, ConfigPatchDto } from '@screenreader-speech-capture/shared';
import { SettingRejected, type ConfigApi, type ConfigState } from '#lib/core/config.js';
import { routeJson, type RouteError } from './route-request.js';

/** A refused save names the bridge's reason (and the setting, when it names one). */
const rejection = (error: RouteError | null, status: number): Error =>
  error === null
    ? new Error(`The request answered ${status}`)
    : new SettingRejected(error.message, error.field);

/** Reads and saves the configuration through the UI's own config route (`url` includes the base path). */
export class HttpConfigApi implements ConfigApi {
  constructor(private readonly url: string) {}

  /** `GET /ui/api/config` answers `{ active, saved, overrides }` in one go. */
  fetch(): Promise<ConfigState> {
    return routeJson<ConfigState>(this.url, { rejection });
  }

  update(patch: ConfigPatchDto): Promise<ConfigDto> {
    return routeJson<ConfigDto>(this.url, { method: 'PUT', body: patch, rejection });
  }
}
