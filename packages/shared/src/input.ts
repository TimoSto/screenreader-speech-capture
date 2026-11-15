import * as v from 'valibot';
import { API_LIMITS } from './limits.js';

const { coordinate, delayMs, maxKeys } = API_LIMITS.input;

export const MOUSE_BUTTONS = ['left', 'right', 'middle'] as const;

export const ClickRequestSchema = v.pipe(
  v.object({
    x: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(-coordinate),
      v.maxValue(coordinate),
      v.description('Screen x in physical pixels.'),
      v.examples([640]),
    ),
    y: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(-coordinate),
      v.maxValue(coordinate),
      v.description('Screen y in physical pixels.'),
      v.examples([12]),
    ),
    button: v.pipe(
      v.optional(v.picklist(MOUSE_BUTTONS)),
      v.description('Mouse button, `left` if omitted.'),
    ),
  }),
  v.description(
    '`POST /input/click`: a native mouse click at a screen point, to give a window the focus. ' +
      'Added in API 1.14.',
  ),
);

/** `POST /api/v1/input/click` */
export type ClickRequestDto = v.InferOutput<typeof ClickRequestSchema>;

export const KeysRequestSchema = v.pipe(
  v.object({
    keys: v.pipe(
      v.union([
        v.pipe(v.string(), v.nonEmpty()),
        v.pipe(v.array(v.pipe(v.string(), v.nonEmpty())), v.minLength(1), v.maxLength(maxKeys)),
      ]),
      v.description(
        'One chord (`Insert+T`) or a sequence of chords (`["h", "h", "Insert+Down"]`). Chords ' +
          'join modifiers (`Control`, `Shift`, `Alt`, `Win`, `Insert`, `CapsLock`) and one key ' +
          'with `+`. Names are case-insensitive (docs/usage/native-input.md#key-names). ' +
          `At most ${maxKeys} chords.`,
      ),
      v.examples(['Insert+T']),
    ),
    delayMs: v.pipe(
      v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(delayMs.max))),
      v.description(
        `Pause between the chords of a sequence in milliseconds, ${delayMs.default} if omitted.`,
      ),
    ),
  }),
  v.description('`POST /input/keys`: send key presses to the focused window. Added in API 1.14.'),
);

/** `POST /api/v1/input/keys` */
export type KeysRequestDto = v.InferOutput<typeof KeysRequestSchema>;
