import type { SendNativeInput } from '../../../../application/ports/in/send-native-input.js';
import { invalidField } from '../../../../domain/errors.js';
import {
  jsonBody,
  keysField,
  numberField,
  optionalNumberField,
  optionalStringField,
} from '../request.js';
import { sendNoContent } from '../response.js';
import type { Router } from '../router.js';

interface InputRoutesDeps {
  input: SendNativeInput;
}

/** `POST /input/click`, `POST /input/keys` (docs/usage/http-api.md#endpoints). */
export function inputRoutes(router: Router, { input }: InputRoutesDeps): void {
  router
    .add('POST', '/input/click', async ({ req, res }) => {
      const body = await jsonBody(req);
      const button = optionalStringField(body, 'button');
      if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') {
        throw invalidField('button', 'must be left, right or middle');
      }
      await input.click({
        x: numberField(body, 'x'),
        y: numberField(body, 'y'),
        button,
      });
      sendNoContent(res);
    })
    .add('POST', '/input/keys', async ({ req, res }) => {
      const body = await jsonBody(req);
      await input.pressKeys({
        keys: keysField(body, 'keys'),
        delayMs: optionalNumberField(body, 'delayMs'),
      });
      sendNoContent(res);
    });
}
