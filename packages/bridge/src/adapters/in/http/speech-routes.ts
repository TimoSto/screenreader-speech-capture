import type http from 'node:http';
import { API_PREFIX } from '@screenreader-speech-capture/shared';
import type { AddMarker } from '../../../application/ports/in/add-marker.js';
import type { ClearSpeech } from '../../../application/ports/in/clear-speech.js';
import type { QuerySpeech } from '../../../application/ports/in/query-speech.js';
import type { WaitForSpeech, WaitResult } from '../../../application/ports/in/wait-for-speech.js';
import type { WatchSpeech } from '../../../application/ports/in/watch-speech.js';
import { AppError, invalidField } from '../../../domain/errors.js';
import type { SpeechEvent } from '../../../domain/speech-event.js';
import { toSpeechEntryDto, toSpeechListDto } from './dto.js';
import { booleanParam, intParam, readJson, stringParam } from './request.js';
import { sendJson } from './response.js';
import type { Router } from './router.js';

export interface SpeechRoutesDeps {
  speech: QuerySpeech & ClearSpeech & AddMarker & WatchSpeech;
  waits: WaitForSpeech;
  /** Open SSE responses, so the server can end them on shutdown. */
  streams: Set<http.ServerResponse>;
  /** Interval of the `: ping` comment on SSE streams. */
  pingMs: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The SSE frame for one event (docs/http-api.md, `GET /speech/stream`). */
function sseFrame(event: SpeechEvent): string {
  if (event.type === 'clear') return 'event: clear\ndata: {}\n\n';
  const data = JSON.stringify(toSpeechEntryDto(event.entry));
  return `id: ${event.entry.seq}\nevent: entry\ndata: ${data}\n\n`;
}

/** `Last-Event-ID` of an SSE reconnect, `null` on a first connect. */
function lastEventId(req: http.IncomingMessage): number | null {
  const raw = req.headers['last-event-id'];
  if (raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw invalidField('Last-Event-ID', 'must be a seq');
  return value;
}

export function speechRoutes(router: Router, deps: SpeechRoutesDeps): void {
  const { speech, waits, streams, pingMs } = deps;

  router
    .add('GET', `${API_PREFIX}/speech`, ({ res, url }) => {
      const page = speech.list({ since: intParam(url, 'since'), limit: intParam(url, 'limit') });
      sendJson(res, 200, toSpeechListDto(page));
    })
    .add('DELETE', `${API_PREFIX}/speech`, ({ res }) => {
      speech.clear();
      res.writeHead(204).end();
    })
    .add('POST', `${API_PREFIX}/markers`, async ({ req, res }) => {
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
          signal: controller.signal,
        });
      } catch (error) {
        // Nobody left to answer, and a client hanging up is not an error.
        if (controller.signal.aborted) return;
        throw error;
      }
      if (result.status === 'timeout') {
        throw new AppError('TIMEOUT', result.message, {
          entries: result.seen.map(toSpeechEntryDto),
        });
      }
      sendJson(res, 200, toSpeechEntryDto(result.entry));
    })
    .add('GET', `${API_PREFIX}/speech/stream`, ({ req, res }) => {
      const since = lastEventId(req);
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      res.flushHeaders();
      const stop = speech.watch(since, (event) => res.write(sseFrame(event)));
      const ping = setInterval(() => res.write(': ping\n\n'), pingMs);
      ping.unref();
      streams.add(res);
      res.on('close', () => {
        stop();
        clearInterval(ping);
        streams.delete(res);
      });
    });
}
