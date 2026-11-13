import type { GetStatus } from '../../../application/ports/in/get-status.js';
import type { ManageConfig } from '../../../application/ports/in/manage-config.js';
import { toConfigDto, toStatusDto } from './dto.js';
import { jsonBody } from './request.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';

export interface StatusRoutesDeps {
  status: GetStatus;
  config: ManageConfig;
}

export function statusRoutes(router: Router, { status, config }: StatusRoutesDeps): void {
  router
    .add('GET', '/status', ({ res }) => sendJson(res, 200, toStatusDto(status.status())))
    .add('GET', '/config', ({ res }) => sendJson(res, 200, toConfigDto(config.get())))
    // After a change to http.*, this answer still comes from the old address.
    .add('PUT', '/config', async ({ req, res }) => {
      const next = await config.update(await jsonBody(req));
      sendJson(res, 200, toConfigDto(next));
    });
}
