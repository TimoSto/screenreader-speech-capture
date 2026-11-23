import { StatusSchema, type StatusDto } from '@screenreader-speech-capture/shared';
import type { StatusApi } from '#lib/core/status.js';
import { routeDto } from './route-request.js';

/** Reads the bridge status through the UI's own status route (`url` includes the base path). */
export class HttpStatusApi implements StatusApi {
  constructor(private readonly url: string) {}

  fetch(): Promise<StatusDto> {
    return routeDto(this.url, StatusSchema);
  }
}
