import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { ManageServices } from '../../../application/ports/in/manage-services.js';
import { SERVICE_NAMES } from '../../../domain/service.js';
import { toServiceStatusDto } from './dto.js';
import { requireJson } from './request.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';

export interface ServiceRoutesDeps {
  services: ManageServices;
}

const ACTIONS = ['start', 'stop', 'restart'] as const;

/**
 * `POST /api/v1/services/{name}/{start|stop|restart}`. Other names fall through to `NOT_FOUND`.
 * The body is ignored, but the JSON content type is required: a web page can't send it
 * cross-origin, so it can't restart a service behind the user's back.
 */
export function serviceRoutes(router: Router, { services }: ServiceRoutesDeps): void {
  for (const name of SERVICE_NAMES) {
    for (const action of ACTIONS) {
      router.add('POST', `${API_PREFIX}/services/${name}/${action}`, async ({ req, res }) => {
        requireJson(req);
        sendJson(res, 200, toServiceStatusDto(await services[action](name)));
      });
    }
  }
}
