import { checkDto, StatusSchema, type StatusDto } from '@screenreader-speech-capture/shared';
import type { StatusApi } from '#lib/core/status.js';

/** Reads the bridge status through the UI's own `/api/status` route. */
export class HttpStatusApi implements StatusApi {
  async fetch(): Promise<StatusDto> {
    const response = await fetch('/api/status', { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`The status request answered ${response.status}`);
    const checked = checkDto(StatusSchema, await response.json());
    if (!checked.ok) throw new Error(`Unexpected status at ${checked.field}: ${checked.message}`);
    return checked.value;
  }
}
