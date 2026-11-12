import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { ManageSessions } from '../../../application/ports/in/manage-sessions.js';
import { invalidField } from '../../../domain/errors.js';
import { toSessionDto, toSessionListDto } from './dto.js';
import { readJson, requireJson } from './request.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';

export interface SessionRoutesDeps {
  sessions: ManageSessions;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `POST /sessions`, `POST /sessions/end`, `GET /sessions` (docs/http-api.md#endpoints). */
export function sessionRoutes(router: Router, { sessions }: SessionRoutesDeps): void {
  router
    .add('POST', `${API_PREFIX}/sessions`, async ({ req, res }) => {
      requireJson(req);
      const body = await readJson(req);
      if (!isObject(body) || typeof body.name !== 'string') {
        throw invalidField('name', 'must be a string');
      }
      const { run } = body;
      if (run !== undefined && run !== null && typeof run !== 'string') {
        throw invalidField('run', 'must be a string or null');
      }
      sendJson(res, 201, toSessionDto(sessions.start({ name: body.name, run })));
    })
    .add('POST', `${API_PREFIX}/sessions/end`, ({ res }) => {
      sessions.end();
      res.writeHead(204).end();
    })
    .add('GET', `${API_PREFIX}/sessions`, ({ res }) =>
      sendJson(res, 200, toSessionListDto(sessions.list())),
    );
}
