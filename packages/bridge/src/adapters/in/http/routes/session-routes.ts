import type { ManageSessions } from '../../../../application/ports/in/manage-sessions.js';
import { toSessionListDto, toStartSessionResponseDto } from '../dto/session.js';
import { clientHeader, jsonBody, nullableStringField, stringField } from '../request.js';
import { sendJson, sendNoContent } from '../response.js';
import type { Router } from '../router.js';

export interface SessionRoutesDeps {
  sessions: ManageSessions;
}

/** `POST /sessions`, `POST /sessions/end`, `GET /sessions` (docs/http-api.md#endpoints). */
export function sessionRoutes(router: Router, { sessions }: SessionRoutesDeps): void {
  router
    .add('POST', '/sessions', async ({ req, res }) => {
      const body = await jsonBody(req);
      const name = stringField(body, 'name');
      const run = nullableStringField(body, 'run');
      const client = clientHeader(req);
      sendJson(res, 201, toStartSessionResponseDto(sessions.start({ name, run, client })));
    })
    .add('POST', '/sessions/end', ({ req, res }) => {
      sessions.end(clientHeader(req));
      sendNoContent(res);
    })
    .add('GET', '/sessions', ({ res }) => sendJson(res, 200, toSessionListDto(sessions.list())));
}
