import { getRequestEvent, query } from '$app/server';

/**
 * The sessions list (`GET /api/v1/sessions`). The monitor page's load awaits it, so its answer is
 * in the server's HTML and the browser's first `getSessions()` needs no request; the browser then
 * re-reads it with `refresh()` (`HttpSessionsApi.list`).
 */
export const getSessions = query(() => getRequestEvent().locals.bridge.sessions());
