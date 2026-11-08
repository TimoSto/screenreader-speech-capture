import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { GetStatus } from '../../../application/ports/in/get-status.js';
import type { ManageConfig } from '../../../application/ports/in/manage-config.js';
import { toConfigDto, toStatusDto } from './dto.js';
import { readJson, requireJson } from './request.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';

export interface StatusRoutesDeps {
  status: GetStatus;
  config: ManageConfig;
}

export function statusRoutes(router: Router, { status, config }: StatusRoutesDeps): void {
  router
    .add('GET', `${API_PREFIX}/status`, ({ res }) =>
      sendJson(res, 200, toStatusDto(status.status())),
    )
    .add('GET', `${API_PREFIX}/config`, ({ res }) => sendJson(res, 200, toConfigDto(config.get())))
    // After a change to http.*, this answer still comes from the old address.
    .add('PUT', `${API_PREFIX}/config`, async ({ req, res }) => {
      requireJson(req);
      const next = await config.update(await readJson(req));
      sendJson(res, 200, toConfigDto(next));
    });
}
