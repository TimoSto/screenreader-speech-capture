import type { ManageConfig } from '../../../../application/ports/in/manage-config.js';
import { invalidField } from '../../../../domain/errors.js';
import { toConfigDto, toConfigOverridesDto } from '../dto/config.js';
import { jsonBody } from '../request.js';
import { sendJson } from '../response.js';
import type { Router } from '../router.js';

interface ConfigRoutesDeps {
  config: ManageConfig;
}

/**
 * `GET /config` (with `view`), `GET /config/overrides`, `PUT /config`
 * (docs/usage/http-api.md#endpoints).
 */
export function configRoutes(router: Router, { config }: ConfigRoutesDeps): void {
  router
    .add('GET', '/config', ({ res, url }) => {
      const view = url.searchParams.get('view') ?? 'active';
      if (view !== 'active' && view !== 'saved') {
        throw invalidField('view', 'must be active or saved');
      }
      sendJson(res, 200, toConfigDto(view === 'saved' ? config.getSaved() : config.get()));
    })
    .add('GET', '/config/overrides', ({ res }) => {
      sendJson(res, 200, toConfigOverridesDto(config.overrides()));
    })
    .add('PUT', '/config', async ({ req, res }) => {
      sendJson(res, 200, toConfigDto(await config.update(await jsonBody(req))));
    });
}
