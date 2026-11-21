import type { RestartBridge } from '../../../../application/ports/in/restart.js';
import { AppError } from '../../../../domain/errors.js';
import type { Router } from '../router.js';

interface RestartRoutesDeps {
  restart: RestartBridge;
}

/** `POST /restart` (docs/usage/http-api.md#endpoints). */
export function restartRoutes(router: Router, { restart }: RestartRoutesDeps): void {
  router.add('POST', '/restart', ({ res }) => {
    if (!restart.canRestart()) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'This bridge cannot restart itself, restart it by hand',
      );
    }
    // Answer first: the restart closes the connections. `finish` means the answer is handed to the OS.
    res.once('finish', () => restart.restart());
    res.writeHead(202).end();
  });
}
