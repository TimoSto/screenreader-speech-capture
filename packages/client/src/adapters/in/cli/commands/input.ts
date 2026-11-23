import type { SpeechEntry } from '../../../../domain/speech-entry.js';
import { EXIT, type Command, type Context, type HelpLine } from '../command.js';
import { TRUNCATED_WARNING } from '../format.js';
import { NAME, UsageError, optionalInt, requiredSignedInt } from '../options.js';

// Native input on the VM (docs/usage/native-input.md).

const CAPTURE_USAGE = '[--capture [--quiet-for <ms>] [--timeout <ms>]]';
const CAPTURE_HELP = [
  '--capture prints the speech it caused, until nothing was spoken',
  'for --quiet-for ms (default 500, 10000)',
];

const FOCUS: HelpLine = {
  usage: `click --x <px> --y <px> [--button left|right|middle] ${CAPTURE_USAGE}`,
  description: [
    'Native click at a screen point in physical pixels, for example to give',
    'a window the focus (negative values: --x=-5);',
    ...CAPTURE_HELP,
  ],
};

export const click: Command = {
  options: ['x', 'y', 'button', 'capture', 'quiet-for', 'timeout'],
  help: [FOCUS],
  async run(args, ctx) {
    const { values, input, out } = ctx;
    if (args.length !== 0) throw new UsageError(`Usage: ${NAME} ${FOCUS.usage}`);
    const x = requiredSignedInt(values, 'x', FOCUS.usage);
    const y = requiredSignedInt(values, 'y', FOCUS.usage);
    const { button } = values;
    if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') {
      throw new UsageError(`--button must be left, right or middle, got "${button}".`);
    }
    const speech = await act(ctx, () => input().click({ x, y }, { button }));
    if (speech === undefined) out('click', { clicked: true }, `Clicked at ${x},${y}`);
    else out('click', { clicked: true, ...speech }, joinText(speech.entries));
    return EXIT.ok;
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
  options: ['delay', 'capture', 'quiet-for', 'timeout'],
  help: [PRESS],
  async run(args, ctx) {
    const { values, input, out } = ctx;
    if (args.length === 0) throw new UsageError(`Usage: ${NAME} ${PRESS.usage}`);
    const delayMs = optionalInt(values, 'delay', 0);
    const keys = args.length === 1 ? args[0]! : args;
    const speech = await act(ctx, () => input().pressKeys(keys, { delayMs }));
    if (speech === undefined) out('press', { pressed: true }, `Pressed ${args.join(' ')}`);
    else out('press', { pressed: true, ...speech }, joinText(speech.entries));
    return EXIT.ok;
  },
};

/**
 * Runs `action`. With `--capture`, returns the speech spoken from just before it until silence
 * (`record`), so speech of earlier steps can't be mistaken for its result.
 */
async function act(
  { values, speech, io }: Context,
  action: () => Promise<void>,
): Promise<{ entries: SpeechEntry[]; truncated: boolean } | undefined> {
  const quietFor = optionalInt(values, 'quiet-for', 1);
  const timeout = optionalInt(values, 'timeout', 0);
  if (!values.capture) {
    if (quietFor !== undefined || timeout !== undefined) {
      throw new UsageError('--quiet-for and --timeout only go with --capture.');
    }
    await action();
    return undefined;
  }
  // A timeout (speech didn't pause) is a SpeechTimeoutError: exit 1, reported like every error.
  const { entries, truncated } = await speech().record(action, { quietFor, timeout });
  if (truncated) io.stderr(`${NAME}: ${TRUNCATED_WARNING}\n`);
  return { entries, truncated };
}

function joinText(entries: readonly SpeechEntry[]): string {
  return entries.map((e) => e.text).join('\n');
}
