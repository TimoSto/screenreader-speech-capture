import { isSpeech, type SpeechEntry } from './speech-entry.js';

/** What a wait looks for: a substring, a regular expression or a predicate. */
export type SpeechMatch = string | RegExp | ((entry: SpeechEntry) => boolean);

export interface MatchOptions {
  /** Ignore case and extra whitespace (strings and regular expressions). */
  normalize?: boolean | undefined;
}

export type SpeechMatcher = (entry: SpeechEntry) => boolean;

/** Lower case, whitespace runs collapsed to one space, trimmed (same rule as the bridge). */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Builds the test for one {@link SpeechMatch}. Markers never match. */
export function toMatcher(match: SpeechMatch, options: MatchOptions = {}): SpeechMatcher {
  const prepare = options.normalize ? normalizeText : (text: string) => text;
  let test: (entry: SpeechEntry) => boolean;

  if (typeof match === 'function') {
    test = match;
  } else if (match instanceof RegExp) {
    // Without `g` / `y`, `test` keeps no state between entries.
    let flags = match.flags.replace(/[gy]/g, '');
    if (options.normalize && !flags.includes('i')) flags += 'i';
    const pattern = new RegExp(match.source, flags);
    test = (entry) => pattern.test(prepare(entry.text));
  } else {
    const needle = prepare(match);
    if (needle === '') throw new TypeError('The text to wait for must not be empty');
    test = (entry) => prepare(entry.text).includes(needle);
  }

  return (entry) => isSpeech(entry) && test(entry);
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
