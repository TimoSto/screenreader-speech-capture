import { API_LIMITS, createTextTest } from '@screenreader-speech-capture/shared';
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

/** Longest `regex` a wait accepts. */
export const MAX_REGEX_LENGTH = API_LIMITS.wait.regexLength;

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
    if (regex === '') throw invalidField('regex', 'must not be empty');
    checkRegexLength(regex);
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

/**
 * A wait's regex runs on every new entry, synchronously on the capture path. A pattern that
 * backtracks badly (`(a+)+$`, `.*.*.*!`) is therefore slow and holds up capture while it runs.
 * That is the caller's responsibility: no heuristic can prove a pattern safe, so only the length
 * is limited (docs/implementation/decisions.md).
 */
function checkRegexLength(regex: string): void {
  if (regex.length > MAX_REGEX_LENGTH) {
    throw invalidField('regex', `must be at most ${MAX_REGEX_LENGTH} characters`);
  }
}
