import { createTextTest } from '@screenreader-speech-capture/shared';
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

  let pattern: RegExp | undefined;
  if (regex !== undefined) {
    try {
      pattern = new RegExp(regex, 'u');
    } catch (error) {
      throw invalidField('regex', (error as Error).message);
    }
  }
  const test = createTextTest(pattern ?? contains ?? '', normalize);
  if (test === undefined) throw invalidField('contains', 'must not be empty');

  return (entry) => entry.kind === 'speech' && test(entry.text);
}
