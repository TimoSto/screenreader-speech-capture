import type http from 'node:http';
import type {
  CaptureInput,
  CaptureOptions,
  InputCaptureResult,
} from '../../../../application/ports/in/capture-input.js';
import type {
  MouseButton,
  SendNativeInput,
} from '../../../../application/ports/in/send-native-input.js';
import { invalidField } from '../../../../domain/errors.js';
import { toInputCaptureDto } from '../dto/input.js';
import {
  jsonBody,
  keysField,
  numberField,
  optionalNumberField,
  optionalObjectField,
  optionalStringField,
} from '../request.js';
import { sendJson, sendNoContent } from '../response.js';
import type { Router } from '../router.js';

interface InputRoutesDeps {
  input: SendNativeInput;
  captures: CaptureInput;
}

/** The `capture` object of an input request, `undefined` without one. */
function captureField(body: unknown): CaptureOptions | undefined {
  const capture = optionalObjectField(body, 'capture');
  if (capture === undefined) return undefined;
  const ms = (name: string) => {
    try {
      return optionalNumberField(capture, name);
    } catch {
      throw invalidField(`capture.${name}`, 'must be a number');
    }
  };
  return {
    quietForMs: ms('quietForMs'),
    firstWithinMs: ms('firstWithinMs'),
    timeoutMs: ms('timeoutMs'),
    settleMs: ms('settleMs'),
  };
}

/**
 * Without `capture`: sends the input and answers 204. With it: records the speech the input
 * causes and answers 200 (docs/usage/native-input.md#capturing-the-speech-an-input-causes).
 */
async function answer(
  res: http.ServerResponse,
  capture: CaptureOptions | undefined,
  send: () => Promise<void>,
  record: (capture: CaptureOptions, signal: AbortSignal) => Promise<InputCaptureResult>,
): Promise<void> {
  if (capture === undefined) {
    await send();
    sendNoContent(res);
    return;
  }
  const controller = new AbortController();
  // The client went away before the answer: stop recording.
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  let result: InputCaptureResult;
  try {
    result = await record(capture, controller.signal);
  } catch (error) {
    // Nobody left to answer, and a client hanging up is not an error.
    if (controller.signal.aborted) return;
    throw error;
  }
  sendJson(res, 200, toInputCaptureDto(result));
}

/** `POST /input/click`, `POST /input/keys` (docs/usage/http-api.md#endpoints). */
export function inputRoutes(router: Router, { input, captures }: InputRoutesDeps): void {
  router
    .add('POST', '/input/click', async ({ req, res }) => {
      const body = await jsonBody(req);
      const button = optionalStringField(body, 'button');
      if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') {
        throw invalidField('button', 'must be left, right or middle');
      }
      // Narrowed by the check above.
      const mouseButton: MouseButton | undefined = button;
      const request = { x: numberField(body, 'x'), y: numberField(body, 'y'), button: mouseButton };
      await answer(
        res,
        captureField(body),
        () => input.click(request),
        (capture, signal) => captures.click({ ...request, capture, signal }),
      );
    })
    .add('POST', '/input/keys', async ({ req, res }) => {
      const body = await jsonBody(req);
      const request = {
        keys: keysField(body, 'keys'),
        delayMs: optionalNumberField(body, 'delayMs'),
      };
      await answer(
        res,
        captureField(body),
        () => input.pressKeys(request),
        (capture, signal) => captures.pressKeys({ ...request, capture, signal }),
      );
    });
}
