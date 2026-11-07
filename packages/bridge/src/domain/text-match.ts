import { AppError, invalidField } from './errors.js';
import type { SpeechEntry } from './speech-entry.js';

export interface TextMatchOptions {
  /** Substring to look for. */
  contains?: string | undefined;
  /** Regular expression source to look for (instead of `contains`). */
  regex?: string | undefined;
  /** Ignore case and extra whitespace. */
  normalize?: boolean | undefined;
}

export type SpeechMatcher = (entry: SpeechEntry) => boolean;

/** Lower case, whitespace runs collapsed to one space, trimmed. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Builds a matcher for `wait`. Exactly one of `contains` and `regex` is required.
 * Only `kind: "speech"` entries match, never markers.
 */
export function createSpeechMatcher(options: TextMatchOptions): SpeechMatcher {
  const { contains, regex, normalize = false } = options;
  if (contains === undefined && regex === undefined) {
    throw new AppError('INVALID_REQUEST', 'One of "contains" and "regex" is required', {
      field: 'contains',
    });
  }
  if (contains !== undefined && regex !== undefined) {
    throw new AppError('INVALID_REQUEST', 'Use either "contains" or "regex", not both', {
      field: 'regex',
    });
  }

  const prepare = normalize ? normalizeText : (text: string) => text;
  let test: (text: string) => boolean;

  if (regex !== undefined) {
    let pattern: RegExp;
    try {
      pattern = new RegExp(regex, normalize ? 'iu' : 'u');
    } catch (error) {
      throw invalidField('regex', (error as Error).message);
    }
    test = (text) => pattern.test(prepare(text));
  } else {
    const needle = prepare(contains ?? '');
    if (needle === '') throw invalidField('contains', 'must not be empty');
    test = (text) => prepare(text).includes(needle);
  }

  return (entry) => entry.kind === 'speech' && test(entry.text);
}
