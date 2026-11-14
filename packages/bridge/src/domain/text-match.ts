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
    checkRegexCost(regex);
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
 * A wait's regex runs on every new entry, synchronously on the capture path, so a pattern that
 * backtracks catastrophically would stall the capture for everyone. Rejects patterns over
 * {@link MAX_REGEX_LENGTH} and a repeated group that repeats something inside without a bound,
 * the usual shape of such patterns (`(a+)+`, `(\w*\s?)*`). Overlapping alternatives such as
 * `(a|aa)+` still pass: this is a guard against the common case, not a proof.
 */
function checkRegexCost(regex: string): void {
  if (regex.length > MAX_REGEX_LENGTH) {
    throw invalidField('regex', `must be at most ${MAX_REGEX_LENGTH} characters`);
  }
  if (hasNestedRepeat(regex)) {
    throw invalidField('regex', 'must not repeat a group that repeats inside, for example (a+)+');
  }
}

/** Whether `*`, `+` or `{n,}` (and `{n,m}`) start at `index`. */
function isRepeat(source: string, index: number): boolean {
  const char = source[index];
  return (
    char === '*' || char === '+' || (char === '{' && /^\{\d+(,\d*)?\}/.test(source.slice(index)))
  );
}

function hasNestedRepeat(source: string): boolean {
  /** Per open group: whether something inside it repeats. */
  const groups: boolean[] = [];
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === '\\') {
      i++;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === '(') groups.push(false);
    else if (char === ')') {
      const repeatsInside = groups.pop() ?? false;
      const repeated = isRepeat(source, i + 1);
      if (repeated && repeatsInside) return true;
      if ((repeated || repeatsInside) && groups.length > 0) groups[groups.length - 1] = true;
    } else if (isRepeat(source, i) && groups.length > 0) {
      groups[groups.length - 1] = true;
    }
  }
  return false;
}
