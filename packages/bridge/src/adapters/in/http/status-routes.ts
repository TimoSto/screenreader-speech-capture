import type { GetStatus } from '../../../application/ports/in/get-status.js';
import { toStatusDto } from './dto.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';

export interface StatusRoutesDeps {
  status: GetStatus;
}

/** `GET /status` (docs/http-api.md#endpoints). */
export function statusRoutes(router: Router, { status }: StatusRoutesDeps): void {
  router.add('GET', '/status', ({ res }) => sendJson(res, 200, toStatusDto(status.status())));
}
