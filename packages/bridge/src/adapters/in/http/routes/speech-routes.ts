import type { SpeechUseCases } from '../../../../application/ports/in/speech-use-cases.js';
import type {
  WaitForSpeech,
  WaitResult,
} from '../../../../application/ports/in/wait-for-speech.js';
import { toSpeechEntryDto, toSpeechListDto, toWaitResultDto } from '../dto/speech.js';
import {
  booleanParam,
  intParam,
  jsonBody,
  lastEventId,
  sessionParam,
  stringField,
  stringParam,
} from '../request.js';
import { sendJson, sendNoContent } from '../response.js';
import type { Router } from '../router.js';
import { bridgeFrame, sseFrame } from '../sse/sse-frames.js';
import type { SseHub, SseSend } from '../sse/sse-hub.js';

export interface SpeechRoutesDeps {
  speech: SpeechUseCases;
  waits: WaitForSpeech;
  /** The open SSE streams. */
  sse: SseHub;
  /** `bridge.instanceId`, sent with speech lists and first on every stream. */
  instanceId: string;
}

export function speechRoutes(router: Router, deps: SpeechRoutesDeps): void {
  const { speech, waits, sse, instanceId } = deps;

  router
    .add('GET', '/speech', ({ res, url }) => {
      const page = speech.list({
        since: intParam(url, 'since'),
        limit: intParam(url, 'limit'),
        session: sessionParam(url),
      });
      sendJson(res, 200, toSpeechListDto(page, instanceId));
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
      // already overflowed the stream. The `bridge` frame goes first, before the replay.
      const stream = () => {
        if (send === undefined) {
          send = sse.open(res, () => unwatch());
          send(bridgeFrame(instanceId));
        }
        return send;
      };
      const unwatch = speech.watch(since, (event) => stream()(sseFrame(event)), {
        session: sessionParam(url),
      });
      stream();
    });
}
