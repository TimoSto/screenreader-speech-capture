import { EXIT, type Command, type HelpLine } from '../command.js';
import { NAME, UsageError, optionalInt, requiredSignedInt } from '../options.js';

// Native input on the VM (docs/usage/native-input.md).

const FOCUS: HelpLine = {
  usage: 'click --x <px> --y <px> [--button left|right|middle]',
  description: [
    'Native click at a screen point in physical pixels, for example to give',
    'a window the focus (negative values: --x=-5)',
  ],
};

export const click: Command = {
  options: ['x', 'y', 'button'],
  help: [FOCUS],
  async run(args, { values, input, out }) {
    if (args.length !== 0) throw new UsageError(`Usage: ${NAME} ${FOCUS.usage}`);
    const x = requiredSignedInt(values, 'x', FOCUS.usage);
    const y = requiredSignedInt(values, 'y', FOCUS.usage);
    const { button } = values;
    if (button !== undefined && button !== 'left' && button !== 'right' && button !== 'middle') {
      throw new UsageError(`--button must be left, right or middle, got "${button}".`);
    }
    await input().click({ x, y }, { button });
    out('click', { clicked: true }, `Clicked at ${x},${y}`);
    return EXIT.ok;
  },
};

const PRESS: HelpLine = {
  usage: 'press <keys...> [--delay <ms>]',
  description: [
    'Native key presses for screen reader commands: one chord ("Insert+T")',
    'or several arguments as a sequence (h h Insert+Down); --delay pauses',
    'between them',
  ],
};

export const press: Command = {
  options: ['delay'],
  help: [PRESS],
  async run(args, { values, input, out }) {
    if (args.length === 0) throw new UsageError(`Usage: ${NAME} ${PRESS.usage}`);
    const delayMs = optionalInt(values, 'delay', 0);
    await input().pressKeys(args.length === 1 ? args[0]! : args, { delayMs });
    out('press', { pressed: true }, `Pressed ${args.join(' ')}`);
    return EXIT.ok;
  },
};
