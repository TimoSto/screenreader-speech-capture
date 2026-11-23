/**
 * The key names of `POST /input/keys` (docs/usage/native-input.md#key-names). The bridge parses
 * chords with this rule, and the CLI checks them before sending and lists the names in `--help`,
 * so both use this one copy. Like `text-match.ts`, it belongs to the contract, not to either side.
 */

/** Keys that can be held down while another key is pressed. `Insert` and `CapsLock` are the screen reader keys. */
export const MODIFIER_KEYS = ['control', 'shift', 'alt', 'win', 'insert', 'capslock'] as const;

/** Keys with a name, besides `a`–`z` and `0`–`9`. */
export const NAMED_KEYS = [
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
export const KEY_ALIASES: Readonly<Record<string, string>> = {
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
  ...MODIFIER_KEYS,
  ...NAMED_KEYS,
  ...'abcdefghijklmnopqrstuvwxyz0123456789',
]);

const MODIFIER_SET: ReadonlySet<string> = new Set(MODIFIER_KEYS);

/** A key by its canonical lower-case name: `a`–`z`, `0`–`9` or one of the lists above. */
export type KeyName = string;

/** One chord: the modifiers held down while `key` is pressed, for example `Insert+T`. */
export interface KeyChord {
  readonly modifiers: readonly KeyName[];
  readonly key: KeyName;
}

/** A parsed chord, or why it is invalid (callers report that in their own way). */
export type KeyChordResult = { ok: true; chord: KeyChord } | { ok: false; message: string };

/**
 * Parses `Insert+T` or `Control+Shift+Home`: modifiers and one last key, joined with `+`, names
 * case-insensitive. Only modifiers may come before the last key, and none twice. A lone modifier
 * (`Insert`) is a chord of that key.
 */
export function parseKeyChord(chord: string): KeyChordResult {
  const names: KeyName[] = [];
  for (const part of chord.split('+')) {
    const lower = part.trim().toLowerCase();
    const name = KEY_ALIASES[lower] ?? lower;
    if (!KEYS.has(name))
      return { ok: false, message: `unknown key "${part.trim()}" in "${chord}"` };
    names.push(name);
  }
  const key = names.pop()!;
  if (new Set(names).size !== names.length || names.includes(key)) {
    return { ok: false, message: `"${chord}" repeats a key` };
  }
  const notModifier = names.find((name) => !MODIFIER_SET.has(name));
  if (notModifier !== undefined) {
    return { ok: false, message: `"${notModifier}" in "${chord}" is not a modifier` };
  }
  return { ok: true, chord: { modifiers: names, key } };
}
