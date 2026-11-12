import type http from 'node:http';
import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { AddMarker } from '../../../application/ports/in/add-marker.js';
import type { ClearSpeech } from '../../../application/ports/in/clear-speech.js';
import type { QuerySpeech } from '../../../application/ports/in/query-speech.js';
import type { WaitForSpeech, WaitResult } from '../../../application/ports/in/wait-for-speech.js';
import type { WatchEvent, WatchSpeech } from '../../../application/ports/in/watch-speech.js';
import { invalidField } from '../../../domain/errors.js';
import { toSessionDto, toSpeechEntryDto, toSpeechListDto, toWaitResultDto } from './dto.js';
import {
  booleanParam,
  intParam,
  readJson,
  requireJson,
  sessionParam,
  stringParam,
} from './request.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';
import type { SseHub, SseSend } from './sse.js';

export interface SpeechRoutesDeps {
  speech: QuerySpeech & ClearSpeech & AddMarker & WatchSpeech;
  waits: WaitForSpeech;
  /** The open SSE streams. */
  sse: SseHub;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** `Last-Event-ID` of an SSE reconnect, `null` on a first connect. */
function lastEventId(req: http.IncomingMessage): number | null {
  const raw = req.headers['last-event-id'];
  if (raw === undefined || raw === '') return null;
  const value = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(value)) throw invalidField('Last-Event-ID', 'must be a seq');
  return value;
}

export function speechRoutes(router: Router, deps: SpeechRoutesDeps): void {
  const { speech, waits, sse } = deps;

  router
    .add('GET', `${API_PREFIX}/speech`, ({ res, url }) => {
      const page = speech.list({
        since: intParam(url, 'since'),
        limit: intParam(url, 'limit'),
        session: sessionParam(url),
      });
      sendJson(res, 200, toSpeechListDto(page));
    })
    .add('DELETE', `${API_PREFIX}/speech`, ({ res }) => {
      speech.clear();
      res.writeHead(204).end();
    })
    .add('POST', `${API_PREFIX}/markers`, async ({ req, res }) => {
      requireJson(req);
      const body = await readJson(req);
      if (!isObject(body) || typeof body.label !== 'string') {
        throw invalidField('label', 'must be a string');
      }
      sendJson(res, 201, toSpeechEntryDto(speech.addMarker(body.label)));
    })
    .add('GET', `${API_PREFIX}/speech/wait`, async ({ res, url }) => {
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
    .add('GET', `${API_PREFIX}/speech/stream`, ({ req, res, url }) => {
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
