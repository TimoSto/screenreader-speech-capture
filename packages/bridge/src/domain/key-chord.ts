import { parseKeyChord as parseSharedKeyChord } from '@screenreader-speech-capture/shared';
import type { KeyChord } from '@screenreader-speech-capture/shared';
import { invalidField } from './errors.js';

// The rule and the key names are part of the contract (packages/shared/src/key-chord.ts), so the
// client's CLI checks keys and lists them with the same copy.
export type { KeyChord, KeyName } from '@screenreader-speech-capture/shared';

/**
 * Parses `Insert+T` or `Control+Shift+Home` (docs/usage/native-input.md#key-names). Throws
 * `INVALID_REQUEST` for the field `keys` if the chord is invalid. The domain knows no names of the
 * input library: the injector maps them.
 */
export function parseKeyChord(chord: string): KeyChord {
  const result = parseSharedKeyChord(chord);
  if (!result.ok) throw invalidField('keys', result.message);
  return result.chord;
}
