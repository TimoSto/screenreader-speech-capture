import type { ManageConfig } from '../../../../application/ports/in/manage-config.js';
import { toConfigDto } from '../dto/config.js';
import { jsonBody } from '../request.js';
import { sendJson } from '../response.js';
import type { Router } from '../router.js';

export interface ConfigRoutesDeps {
  config: ManageConfig;
}

/** `GET /config`, `PUT /config` (docs/http-api.md#endpoints). */
export function configRoutes(router: Router, { config }: ConfigRoutesDeps): void {
  router
    .add('GET', '/config', ({ res }) => sendJson(res, 200, toConfigDto(config.get())))
    // After a change to http.*, this answer still comes from the old address.
    .add('PUT', '/config', async ({ req, res }) => {
      const next = await config.update(await jsonBody(req));
      sendJson(res, 200, toConfigDto(next));
    });
}
