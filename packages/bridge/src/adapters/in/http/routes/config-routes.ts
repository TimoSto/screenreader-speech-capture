import type { ManageConfig } from '../../../../application/ports/in/manage-config.js';
import { toConfigDto } from '../dto/config.js';
import { jsonBody } from '../request.js';
import { sendJson } from '../response.js';
import type { Router } from '../router.js';

interface ConfigRoutesDeps {
  config: ManageConfig;
}

/** `GET /config`, `PUT /config` (docs/usage/http-api.md#endpoints). */
export function configRoutes(router: Router, { config }: ConfigRoutesDeps): void {
  router
    .add('GET', '/config', ({ res }) => {
      sendJson(res, 200, toConfigDto(config.get()));
    })
    .add('PUT', '/config', async ({ req, res }) => {
      sendJson(res, 200, toConfigDto(await config.update(await jsonBody(req))));
    });
}
