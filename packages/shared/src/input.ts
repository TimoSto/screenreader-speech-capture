import * as v from 'valibot';
import { API_LIMITS } from './limits.js';
import { SpeechEntrySchema } from './speech.js';

const { coordinate, delayMs, maxKeys } = API_LIMITS.input;
const CAPTURE = API_LIMITS.capture;

const ms = (min: number, max: number, description: string) =>
  v.pipe(
    v.optional(v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max))),
    v.description(description),
  );

export const CaptureOptionsSchema = v.pipe(
  v.object({
    quietForMs: ms(
      CAPTURE.quietForMs.min,
      CAPTURE.quietForMs.max,
      `The capture ends when nothing was spoken for this long, ${CAPTURE.quietForMs.default} if omitted.`,
    ),
    firstWithinMs: ms(
      0,
      CAPTURE.firstWithinMs.max,
      'How long the first speech may take after the input; none in that time is `no-speech`. ' +
        `${CAPTURE.firstWithinMs.default} if omitted.`,
    ),
    timeoutMs: ms(
      0,
      CAPTURE.timeoutMs.max,
      'Longest capture, counted from the input; speech that goes on until then is `timeout`. ' +
        `${CAPTURE.timeoutMs.default} if omitted.`,
    ),
    settleMs: ms(
      0,
      CAPTURE.settleMs.max,
      'Before the input, wait until nothing was spoken for this long (at most `timeoutMs`), so ' +
        'speech still trailing from an earlier step is not captured. The input is sent after ' +
        '`timeoutMs` even if the speech did not pause. 0 (no wait) if omitted.',
    ),
  }),
  v.description(
    'Records the speech the input causes and answers `200` with it (`InputCapture`) instead of ' +
      '`204`. Times are in milliseconds and measured on the bridge, from when it received the ' +
      'speech. Added in API 1.19.',
  ),
);

/** The `capture` of `POST /api/v1/input/click` and `POST /api/v1/input/keys`. */
export type CaptureOptionsDto = v.InferOutput<typeof CaptureOptionsSchema>;

const capture = v.optional(CaptureOptionsSchema);

export const INPUT_CAPTURE_STATUSES = ['silent', 'no-speech', 'timeout'] as const;

export const InputCaptureSchema = v.pipe(
  v.object({
    status: v.pipe(
      v.picklist(INPUT_CAPTURE_STATUSES),
      v.description(
        '`silent`: speech came and paused for `quietForMs`. `no-speech`: nothing was spoken ' +
          'within `firstWithinMs`. `timeout`: the speech went on until `timeoutMs`; `entries` ' +
          'holds what was said until then. The input was sent in every case.',
      ),
    ),
    startSeq: v.pipe(
      v.pipe(v.number(), v.integer(), v.minValue(0)),
      v.description(
        'The `seq` of the newest entry right before the input was sent: the capture holds the ' +
          'speech after it.',
      ),
    ),
    entries: v.pipe(
      v.array(SpeechEntrySchema),
      v.maxLength(CAPTURE.entries),
      v.description(
        `The speech entries (no markers) after \`startSeq\`, oldest first, at most the first ${CAPTURE.entries}.`,
      ),
    ),
    omitted: v.pipe(
      v.pipe(v.number(), v.integer(), v.minValue(0)),
      v.description('How many later speech entries were left out.'),
    ),
    truncated: v.pipe(
      v.boolean(),
      v.description(
        '`true` when entries after `startSeq` were dropped because the buffer was full.',
      ),
    ),
  }),
  v.description(
    'The answer of `POST /input/click` and `POST /input/keys` with `capture`. Added in API 1.19.',
  ),
);

/** `POST /api/v1/input/click` and `POST /api/v1/input/keys` with `capture`. */
export type InputCaptureDto = v.InferOutput<typeof InputCaptureSchema>;

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
    capture,
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
    capture,
  }),
  v.description('`POST /input/keys`: send key presses to the focused window. Added in API 1.14.'),
);

/** `POST /api/v1/input/keys` */
export type KeysRequestDto = v.InferOutput<typeof KeysRequestSchema>;
