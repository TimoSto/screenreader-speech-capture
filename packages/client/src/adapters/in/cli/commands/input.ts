import { parseKeyChord } from '@screenreader-speech-capture/shared';
import {
  FocusError,
  READ_GEOMETRY_SCRIPT,
  clickPoint,
  parseWindowGeometry,
  type WindowGeometry,
} from '../../../../domain/native-input.js';
import { SpeechTimeoutError } from '../../../../domain/errors.js';
import type {
  InputRecording,
  InputRecordOptions,
} from '../../../../application/ports/in/native-input.js';
import type { SpeechEntry } from '../../../../domain/speech-entry.js';
import { EXIT, type Command, type Context, type HelpLine } from '../command.js';
import { TRUNCATED_WARNING } from '../format.js';
import { NAME, UsageError, expectArgs, optionalInt, requiredSignedInt } from '../options.js';

// Native input on the VM (docs/usage/native-input.md).

// The timing options take milliseconds; `<ms>` doesn't fit the 100 columns of `click`'s line.
const CAPTURE_USAGE = '[--capture [--first-within|--quiet-for|--timeout|--settle]]';
const CAPTURE_HELP = [
  '--capture prints the speech it caused, timed on the bridge: waits up to',
  '--first-within ms for the first speech, then until nothing was spoken',
  'for --quiet-for ms (default 2000, 500, 10000); exits 1 if speech goes',
  'on until --timeout ms; --settle <ms> first waits for that much silence',
];
const CAPTURE_OPTIONS = ['capture', 'first-within', 'quiet-for', 'timeout', 'settle'] as const;

const CLICK: HelpLine = {
  usage: `click --x <px> --y <px> [--button <b>] ${CAPTURE_USAGE}`,
  description: [
    'Native click at a screen point in physical pixels, for example to give',
    'a window the focus (negative values: --x=-5); --button left (default),',
    'right or middle;',
    ...CAPTURE_HELP,
  ],
};

export const click: Command = {
  options: ['x', 'y', 'button', ...CAPTURE_OPTIONS],
  help: [CLICK],
  async run(args, ctx) {
    const { values, input, out } = ctx;
    expectArgs(args, 0, CLICK.usage);
    const x = requiredSignedInt(values, 'x', CLICK.usage);
    const y = requiredSignedInt(values, 'y', CLICK.usage);
    const { button } = values;
    if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') {
      throw new UsageError(`--button must be left, right or middle, got "${button}".`);
    }
    const exit = await act(
      ctx,
      () => input().click({ x, y }, { button }),
      (options) => input().recordClick({ x, y }, { button, ...options }),
      (captured) => out('click', { clicked: true, ...captured }, joinText(captured.entries)),
    );
    if (exit === undefined) out('click', { clicked: true }, `Clicked at ${x},${y}`);
    return exit ?? EXIT.ok;
  },
};

const PRESS: HelpLine = {
  usage: `press <keys...> [--delay <ms>] ${CAPTURE_USAGE}`,
  description: [
    'Native key presses for screen reader commands: one chord ("Insert+T")',
    'or several arguments as a sequence (h h Insert+Down); --delay pauses',
    'between them;',
    ...CAPTURE_HELP,
  ],
};

export const press: Command = {
  options: ['delay', ...CAPTURE_OPTIONS],
  help: [PRESS],
  async run(args, ctx) {
    const { values, input, out } = ctx;
    // One or more keys: more than expectArgs checks.
    if (args.length === 0) throw new UsageError(`Usage: ${NAME} ${PRESS.usage}`);
    const delayMs = optionalInt(values, 'delay', 0);
    // The same rule as the bridge's: a wrong key name is a usage error, not a bridge error.
    for (const chord of args) {
      const parsed = parseKeyChord(chord);
      if (!parsed.ok) throw new UsageError(`Invalid key: ${parsed.message} (key names: --help).`);
    }
    const keys = args.length === 1 ? args[0]! : args;
    const exit = await act(
      ctx,
      () => input().pressKeys(keys, { delayMs }),
      (options) => input().recordKeys(keys, { delayMs, ...options }),
      (captured) => out('press', { pressed: true, ...captured }, joinText(captured.entries)),
    );
    if (exit === undefined) out('press', { pressed: true }, `Pressed ${args.join(' ')}`);
    return exit ?? EXIT.ok;
  },
};

const FOCUS: HelpLine = {
  usage: `focus (--script | --geometry <json>) ${CAPTURE_USAGE}`,
  description: [
    'Bring the browser to the foreground, before press: run the --script',
    "function with Playwright MCP's browser_evaluate and pass its result as",
    '--geometry; clicks the middle of the title bar;',
    ...CAPTURE_HELP,
  ],
};

/** What MCP's `browser_evaluate` runs: the same script `setFocus` evaluates in the page. */
export const FOCUS_SCRIPT = `() => ${READ_GEOMETRY_SCRIPT}`;

export const focus: Command = {
  options: ['script', 'geometry', ...CAPTURE_OPTIONS],
  help: [FOCUS],
  async run(args, ctx) {
    const { values, input, out } = ctx;
    expectArgs(args, 0, FOCUS.usage);
    // Exactly one of --script and --geometry.
    if (Boolean(values.script) === (values.geometry !== undefined)) {
      throw new UsageError(`Usage: ${NAME} ${FOCUS.usage}`);
    }
    if (values.script) {
      if (values.capture) throw new UsageError('--capture goes with --geometry, not --script.');
      out('focus', { script: FOCUS_SCRIPT }, FOCUS_SCRIPT);
      return EXIT.ok;
    }
    const point = clickPoint(geometryOf(values.geometry!));
    const exit = await act(
      ctx,
      () => input().click(point),
      (options) => input().recordClick(point, options),
      (captured) => out('focus', { focused: true, point, ...captured }, joinText(captured.entries)),
    );
    if (exit === undefined) {
      out(
        'focus',
        { focused: true, point },
        `Focused: clicked the title bar at ${point.x},${point.y}`,
      );
    }
    return exit ?? EXIT.ok;
  },
};

/** `--geometry`: what the `--script` function returned, as JSON. */
function geometryOf(raw: string): WindowGeometry {
  try {
    return parseWindowGeometry(JSON.parse(raw));
  } catch (error) {
    if (!(error instanceof SyntaxError || error instanceof FocusError)) throw error;
    throw new UsageError(
      `--geometry must be the JSON object the "focus --script" function returns ` +
        `(screenX, screenY, outerWidth, outerHeight, innerWidth, innerHeight, ` +
        `devicePixelRatio): ${error.message}`,
    );
  }
}

/** What `--capture` recorded; `silent: false` when the speech went on until `--timeout`. */
interface Captured {
  entries: SpeechEntry[];
  truncated: boolean;
  silent: boolean;
}

/**
 * Runs `action`. Without `--capture`, returns `undefined`. With it, runs `record` instead: the
 * bridge sends the input and records the speech after it until silence
 * (docs/usage/native-input.md#capturing-the-speech-an-input-causes), so speech of earlier steps
 * can't be mistaken for its result; hands it to `print` and returns the exit code. Speech that
 * doesn't pause is a result too (`silent: false`, exit 1): what was said is what the caller has
 * to judge.
 */
async function act(
  { values, io, json }: Context,
  action: () => Promise<void>,
  record: (options: InputRecordOptions) => Promise<InputRecording>,
  print: (captured: Captured) => void,
): Promise<number | undefined> {
  const firstWithin = optionalInt(values, 'first-within', 0);
  const quietFor = optionalInt(values, 'quiet-for', 1);
  const timeout = optionalInt(values, 'timeout', 0);
  const settle = optionalInt(values, 'settle', 0);
  if (!values.capture) {
    if ([firstWithin, quietFor, timeout, settle].some((value) => value !== undefined)) {
      throw new UsageError(
        '--first-within, --quiet-for, --timeout and --settle only go with --capture.',
      );
    }
    await action();
    return undefined;
  }
  let captured: Captured;
  let failure: string | undefined;
  try {
    const recording = await record({ firstWithin, quietFor, timeout, settle });
    captured = { entries: recording.entries, truncated: recording.truncated, silent: true };
    if (captured.truncated) io.stderr(`${NAME}: ${TRUNCATED_WARNING}\n`);
  } catch (error) {
    if (!(error instanceof SpeechTimeoutError)) throw error;
    // Its message already says when speech was dropped from the bridge's full buffer.
    captured = { entries: error.entries, truncated: error.truncated, silent: false };
    failure = `${error.message}; the action has happened`;
  }
  // Text mode prints nothing for no speech, rather than an empty line.
  if (json || captured.entries.length > 0) print(captured);
  if (captured.entries.length === 0) io.stderr(`${NAME}: no speech after the action.\n`);
  if (failure === undefined) return EXIT.ok;
  io.stderr(`${NAME}: ${failure}.\n`);
  return EXIT.timeout;
}

function joinText(entries: readonly SpeechEntry[]): string {
  return entries.map((e) => e.text).join('\n');
}
