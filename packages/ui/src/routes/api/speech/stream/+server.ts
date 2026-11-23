import { bridgeApiFromEnv } from '#lib/server/bridge-api.js';
import { scopeParam } from '#lib/server/scope.js';
import type { RequestHandler } from './$types';

/**
 * Relays the bridge's SSE stream to the browser. `?session=<id|none>` and `Last-Event-ID` go
 * through (`?since=0` replays the whole buffer), so the browser's own reconnects replay what it
 * missed. The upstream request ends when
 * the browser goes away.
 */
export const GET: RequestHandler = async ({ url, request, fetch }) => {
  const upstream = await bridgeApiFromEnv(fetch).openSpeechStream(
    scopeParam(url),
    // `EventSource` cannot set the header on its first request, so `?since=` stands in for it; the
    // header it sends itself when it reconnects wins.
    request.headers.get('last-event-id') ?? url.searchParams.get('since'),
    request.signal,
  );
  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
};
