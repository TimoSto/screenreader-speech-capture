import type { ManageSessions } from '../../../../application/ports/in/manage-sessions.js';
import { toSessionListDto, toStartSessionResponseDto } from '../dto/session.js';
import { invalidField } from '../../../../domain/errors.js';
import {
  clientHeader,
  jsonBody,
  nullableStringField,
  sessionParam,
  stringField,
} from '../request.js';
import { sendJson, sendNoContent } from '../response.js';
import type { Router } from '../router.js';

interface SessionRoutesDeps {
  sessions: ManageSessions;
}

/** `POST /sessions`, `POST /sessions/end`, `DELETE /sessions`, `GET /sessions` (docs/usage/http-api.md#endpoints). */
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
    .add('DELETE', '/sessions', ({ res, url }) => {
      const session = sessionParam(url);
      if (typeof session !== 'number') {
        throw invalidField('session', 'must be the id of an ended session');
      }
      sessions.delete(session);
      sendNoContent(res);
    })
    .add('GET', '/sessions', ({ res }) => sendJson(res, 200, toSessionListDto(sessions.list())));
}
