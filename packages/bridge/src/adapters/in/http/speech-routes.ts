import type { AddMarker } from '../../../application/ports/in/add-marker.js';
import type { ClearSpeech } from '../../../application/ports/in/clear-speech.js';
import type { QuerySpeech } from '../../../application/ports/in/query-speech.js';
import type { WaitForSpeech, WaitResult } from '../../../application/ports/in/wait-for-speech.js';
import type { WatchEvent, WatchSpeech } from '../../../application/ports/in/watch-speech.js';
import { toSessionDto, toSpeechEntryDto, toSpeechListDto, toWaitResultDto } from './dto.js';
import {
  booleanParam,
  intParam,
  jsonBody,
  lastEventId,
  sessionParam,
  stringField,
  stringParam,
} from './request.js';
import { sendJson, sendNoContent } from './response.js';
import type { Router } from './router.js';
import type { SseHub, SseSend } from './sse.js';

export interface SpeechRoutesDeps {
  speech: QuerySpeech & ClearSpeech & AddMarker & WatchSpeech;
  waits: WaitForSpeech;
  /** The open SSE streams. */
  sse: SseHub;
}

/** The SSE frame for one event (docs/http-api.md, `GET /speech/stream`). */
function sseFrame(event: WatchEvent): string {
  switch (event.type) {
    case 'entry': {
      const data = JSON.stringify(toSpeechEntryDto(event.entry));
      return `id: ${event.entry.seq}\nevent: entry\ndata: ${data}\n\n`;
    }
    // No `id:`, so `Last-Event-ID` stays the seq of the last entry.
    case 'session':
      return `event: session\ndata: ${JSON.stringify(toSessionDto(event.session))}\n\n`;
    default:
      return `event: ${event.type}\ndata: {}\n\n`;
  }
}

export function speechRoutes(router: Router, deps: SpeechRoutesDeps): void {
  const { speech, waits, sse } = deps;

  router
    .add('GET', '/speech', ({ res, url }) => {
      const page = speech.list({
        since: intParam(url, 'since'),
        limit: intParam(url, 'limit'),
        session: sessionParam(url),
      });
      sendJson(res, 200, toSpeechListDto(page));
    })
    .add('DELETE', '/speech', ({ res }) => {
      speech.clear();
      sendNoContent(res);
    })
    .add('POST', '/markers', async ({ req, res }) => {
      const label = stringField(await jsonBody(req), 'label');
      sendJson(res, 201, toSpeechEntryDto(speech.addMarker(label)));
    })
    .add('GET', '/speech/wait', async ({ res, url }) => {
      const controller = new AbortController();
      // The client went away before the answer: stop waiting.
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });
      let result: WaitResult;
      try {
        result = await waits.wait({
          contains: stringParam(url, 'contains'),
          regex: stringParam(url, 'regex'),
          normalize: booleanParam(url, 'normalize'),
          since: intParam(url, 'since'),
          timeoutMs: intParam(url, 'timeoutMs'),
          session: sessionParam(url),
          signal: controller.signal,
        });
      } catch (error) {
        // Nobody left to answer, and a client hanging up is not an error.
        if (controller.signal.aborted) return;
        throw error;
      }
      // A timeout is an expected answer, not an error: `408` would invite clients and proxies
      // to repeat the request.
      sendJson(res, 200, toWaitResultDto(result));
    })
    .add('GET', '/speech/stream', ({ req, res, url }) => {
      const since = lastEventId(req);
      // The stream opens on the first event at the latest: `watch` rejects an unknown session
      // before it calls the listener, so that is still answered as a JSON error.
      let send: SseSend | undefined;
      // `close` is emitted asynchronously, so `unwatch` is set by then, even if the replay
      // already overflowed the stream.
      const stream = () => (send ??= sse.open(res, () => unwatch()));
      const unwatch = speech.watch(since, (event) => stream()(sseFrame(event)), {
        session: sessionParam(url),
      });
      stream();
    });
}
