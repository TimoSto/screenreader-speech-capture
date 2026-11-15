import { invalidField } from './errors.js';

/** Keys that can be held down while another key is pressed. `Insert` and `CapsLock` are the screen reader keys. */
const MODIFIERS = ['control', 'shift', 'alt', 'win', 'insert', 'capslock'] as const;

const NAMED_KEYS = [
  'enter',
  'tab',
  'escape',
  'space',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
  ...Array.from({ length: 12 }, (_, index) => `f${index + 1}`),
] as const;

/** Aliases accepted in a chord, by their lower-case spelling. */
const ALIASES: Readonly<Record<string, string>> = {
  ctrl: 'control',
  windows: 'win',
  meta: 'win',
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  ins: 'insert',
  pgup: 'pageup',
  pgdn: 'pagedown',
};

const KEYS: ReadonlySet<string> = new Set([
  ...MODIFIERS,
  ...NAMED_KEYS,
  ...'abcdefghijklmnopqrstuvwxyz0123456789',
]);

const MODIFIER_SET: ReadonlySet<string> = new Set(MODIFIERS);

/**
 * A key by its canonical lower-case name: `a`–`z`, `0`–`9`, the names in
 * docs/usage/native-input.md#key-names. The domain knows no names of the input library: the
 * injector maps them.
 */
export type KeyName = string;

/** One chord: the modifiers held down while `key` is pressed, for example `Insert+T`. */
export interface KeyChord {
  readonly modifiers: readonly KeyName[];
  readonly key: KeyName;
}

function keyName(chord: string, raw: string): KeyName {
  const lower = raw.trim().toLowerCase();
  const name = ALIASES[lower] ?? lower;
  if (!KEYS.has(name)) {
    throw invalidField('keys', `unknown key "${raw.trim()}" in "${chord}"`);
  }
  return name;
}

/**
 * Parses `Insert+T` or `Control+Shift+Home`: modifiers and one last key, joined with `+`, names
 * case-insensitive. Only modifiers may come before the last key, and none twice. A lone modifier
 * (`Insert`) is a chord of that key.
 */
export function parseKeyChord(chord: string): KeyChord {
  const names = chord.split('+').map((part) => keyName(chord, part));
  const key = names.pop()!;
  if (new Set(names).size !== names.length || names.includes(key)) {
    throw invalidField('keys', `"${chord}" repeats a key`);
  }
  const notModifier = names.find((name) => !MODIFIER_SET.has(name));
  if (notModifier !== undefined) {
    throw invalidField('keys', `"${notModifier}" in "${chord}" is not a modifier`);
  }
  return { modifiers: names, key };
}
