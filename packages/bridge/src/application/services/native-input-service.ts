import { API_LIMITS } from '@screenreader-speech-capture/shared';
import { invalidField } from '../../domain/errors.js';
import { type KeyChord, parseKeyChord } from '../../domain/key-chord.js';
import type {
  ClickRequest,
  InputHooks,
  InputQueue,
  PressKeysRequest,
  SendNativeInput,
} from '../ports/in/send-native-input.js';
import type { Clock } from '../ports/out/clock.js';
import type { InputInjector } from '../ports/out/input-injector.js';
import type { Logger } from '../ports/out/logger.js';

interface NativeInputServiceDeps {
  injector: InputInjector;
  clock: Pick<Clock, 'sleep'>;
  logger: Logger;
}

const { coordinate, delayMs, maxKeys } = API_LIMITS.input;
const BUTTONS = ['left', 'right', 'middle'];

function checkCoordinate(field: string, value: number): void {
  if (!Number.isInteger(value) || Math.abs(value) > coordinate) {
    throw invalidField(field, `must be an integer from -${coordinate} to ${coordinate}`);
  }
}

/** Parses the request's keys: one chord or a non-empty sequence of at most `maxKeys`. */
function parseKeys(keys: string | readonly string[]): KeyChord[] {
  const list = typeof keys === 'string' ? [keys] : keys;
  if (list.length === 0 || list.length > maxKeys) {
    throw invalidField('keys', `must hold 1 to ${maxKeys} chords`);
  }
  return list.map(parseKeyChord);
}

/**
 * Clicks and key presses on the machine (docs/usage/native-input.md). A request is checked before
 * anything is sent. All requests share one queue, so a click and a chord (or two sequences) never
 * interleave. Modifiers of a chord are released again even when a key fails.
 */
export class NativeInputService implements SendNativeInput, InputQueue {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: NativeInputServiceDeps) {}

  async click({ x, y, button = 'left' }: ClickRequest, hooks: InputHooks = {}): Promise<void> {
    checkCoordinate('x', x);
    checkCoordinate('y', y);
    if (!BUTTONS.includes(button)) {
      throw invalidField('button', 'must be left, right or middle');
    }
    await this.enqueue(async () => {
      await hooks.beforeInject?.();
      await this.deps.injector.click(x, y, button);
      this.deps.logger.info(`click ${button} at ${x},${y}`);
    });
  }

  async pressKeys(
    { keys, delayMs: delay = delayMs.default }: PressKeysRequest,
    hooks: InputHooks = {},
  ): Promise<void> {
    const chords = parseKeys(keys);
    if (!Number.isInteger(delay) || delay < 0 || delay > delayMs.max) {
      throw invalidField('delayMs', `must be an integer from 0 to ${delayMs.max}`);
    }
    await this.enqueue(async () => {
      await hooks.beforeInject?.();
      for (const [index, chord] of chords.entries()) {
        if (index > 0 && delay > 0) await this.deps.clock.sleep(delay);
        await this.press(chord);
      }
      this.deps.logger.info(`keys ${typeof keys === 'string' ? keys : keys.join(' ')}`);
    });
  }

  private async press({ modifiers, key }: KeyChord): Promise<void> {
    const { injector } = this.deps;
    const held: string[] = [];
    try {
      for (const modifier of modifiers) {
        await injector.keyDown(modifier);
        held.push(modifier);
      }
      await injector.keyTap(key);
    } finally {
      for (const modifier of held.reverse()) await injector.keyUp(modifier);
    }
  }

  exclusive<T>(task: () => Promise<T>): Promise<T> {
    return this.enqueue(task);
  }

  /** Runs `task` after the earlier ones; a failed task doesn't stop the later ones. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
