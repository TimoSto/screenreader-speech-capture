import { describe, expect, it } from 'vitest';
import type { SpeechEntry } from './speech-entry.js';
import { advanceSequence, toMatcher } from './text-match.js';

let seq = 0;
const entry = (text: string, kind: SpeechEntry['kind'] = 'speech'): SpeechEntry => ({
  seq: ++seq,
  kind,
  text,
  receivedAt: '2026-01-01T00:00:00.000Z',
  source: kind === 'speech' ? 'tcp' : 'api',
  voice: null,
  connectionId: null,
  sessionId: null,
});

describe('toMatcher', () => {
  it('matches strings and regexes (rules in packages/shared/src/text-match.ts)', () => {
    expect(toMatcher('Submit')(entry('Submit, button'))).toBe(true);
    expect(toMatcher(/^edit/, { normalize: true })(entry('  Edit'))).toBe(true);
  });

  it('calls a predicate, and never matches markers', () => {
    expect(toMatcher((e) => e.text.length === 3)(entry('abc'))).toBe(true);
    expect(toMatcher(() => true)(entry('abc', 'marker'))).toBe(false);
    expect(toMatcher('abc')(entry('abc', 'marker'))).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(() => toMatcher('')).toThrow(TypeError);
    expect(() => toMatcher(' ', { normalize: true })).toThrow(TypeError);
  });
});

describe('advanceSequence', () => {
  it('continues where it left off and needs one entry per match', () => {
    const matchers = ['a', 'b', 'c'].map((m) => toMatcher(m));
    const first = advanceSequence(matchers, [], [entry('a b'), entry('x')]);
    expect(first.map((e) => e.text)).toEqual(['a b']);
    const second = advanceSequence(matchers, first, [entry('b'), entry('c'), entry('a')]);
    expect(second.map((e) => e.text)).toEqual(['a b', 'b', 'c']);
  });
});
