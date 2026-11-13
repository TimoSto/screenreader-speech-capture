import { createTextTest } from '@screenreader-speech-capture/shared';
import { isSpeech, type SpeechEntry } from './speech-entry.js';

/** What a wait looks for: a substring, a regular expression or a predicate. */
export type SpeechMatch = string | RegExp | ((entry: SpeechEntry) => boolean);

export interface MatchOptions {
  /** Ignore case and extra whitespace (strings and regular expressions). */
  normalize?: boolean | undefined;
}

export type SpeechMatcher = (entry: SpeechEntry) => boolean;

/** Builds the test for one {@link SpeechMatch}. Markers never match. */
export function toMatcher(match: SpeechMatch, options: MatchOptions = {}): SpeechMatcher {
  if (typeof match === 'function') return (entry) => isSpeech(entry) && match(entry);

  const test = createTextTest(match, options.normalize ?? false);
  if (test === undefined) throw new TypeError('The text to wait for must not be empty');
  return (entry) => isSpeech(entry) && test(entry.text);
}

/**
 * Feeds `entries` into an ordered search for `matchers` and returns the matches found so far
 * (`found` extended). Other entries may come in between. Done when the result has
 * `matchers.length` entries.
 */
export function advanceSequence(
  matchers: readonly SpeechMatcher[],
  found: readonly SpeechEntry[],
  entries: readonly SpeechEntry[],
): SpeechEntry[] {
  const result = [...found];
  for (const entry of entries) {
    const next = matchers[result.length];
    if (next === undefined) break;
    if (next(entry)) result.push(entry);
  }
  return result;
}
