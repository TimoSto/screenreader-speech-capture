import type { ManageConfig } from '../../../../application/ports/in/manage-config.js';
import { toConfigResponseDto } from '../dto/config.js';
import { jsonBody } from '../request.js';
import { sendJson } from '../response.js';
import type { Router } from '../router.js';

export interface ConfigRoutesDeps {
  config: ManageConfig;
}

/** `GET /config`, `PUT /config` (docs/http-api.md#endpoints). */
export function configRoutes(router: Router, { config }: ConfigRoutesDeps): void {
  router
    .add('GET', '/config', ({ res }) => {
      const restartRequired = config.restartRequired();
      sendJson(res, 200, toConfigResponseDto({ config: config.get(), restartRequired }));
    })
    .add('PUT', '/config', async ({ req, res }) => {
      const update = await config.update(withoutReadOnly(await jsonBody(req)));
      sendJson(res, 200, toConfigResponseDto(update));
    });
}

/**
 * The body without `restartRequired`, so the answer of a `GET` can be sent back as it is. It is
 * reported, not set.
 */
function withoutReadOnly(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  const patch = { ...(body as Record<string, unknown>) };
  delete patch.restartRequired;
  return patch;
}
