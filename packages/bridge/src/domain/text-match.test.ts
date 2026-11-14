import { describe, expect, it } from 'vitest';
import { AppError } from './errors.js';
import type { SpeechEntry } from './speech-entry.js';
import { createSpeechMatcher, MAX_REGEX_LENGTH } from './text-match.js';

function entry(text: string, kind: SpeechEntry['kind'] = 'speech'): SpeechEntry {
  return {
    seq: 1,
    kind,
    text,
    receivedAt: new Date(0),
    source: 'tcp',
    voice: null,
    connectionId: 1,
    sessionId: null,
  };
}

describe('createSpeechMatcher', () => {
  it('matches contains or regex (rules in packages/shared/src/text-match.ts)', () => {
    expect(createSpeechMatcher({ contains: 'Submit' })(entry('Form Submit, button'))).toBe(true);
    expect(createSpeechMatcher({ regex: '^edit', normalize: true })(entry('  Edit'))).toBe(true);
  });

  it('never matches markers', () => {
    expect(createSpeechMatcher({ contains: 'step' })(entry('step 3', 'marker'))).toBe(false);
  });

  it.each([
    [{}, 'contains'],
    [{ contains: 'a', regex: 'a' }, 'regex'],
    [{ regex: '(' }, 'regex'],
    [{ contains: '   ', normalize: true }, 'contains'],
  ])('rejects %j', (options, field) => {
    try {
      createSpeechMatcher(options);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).details?.field).toBe(field);
    }
  });

  describe('regex cost', () => {
    it.each([
      '(a+)+$',
      '(a*)*b',
      '(\\w+\\s?)*$',
      '((ab)+)+',
      '(?:x+){2,}',
      '(a{1,9})+',
      '((a+)b)*',
    ])('rejects the nested repeat %s', (regex) => {
      expect(() => createSpeechMatcher({ regex })).toThrow(
        expect.objectContaining({ details: { field: 'regex' } }) as Error,
      );
    });

    it.each([
      '(ab)+',
      'a+b*',
      '(Submit|OK), button',
      '[(a+)]+',
      '\\(a+\\)+',
      '(a+)?',
      '^(\\d{3}) items$',
    ])('accepts %s', (regex) => {
      expect(() => createSpeechMatcher({ regex })).not.toThrow();
    });

    it('rejects a regex over the length limit', () => {
      expect(() => createSpeechMatcher({ regex: 'a'.repeat(MAX_REGEX_LENGTH + 1) })).toThrow(
        `at most ${MAX_REGEX_LENGTH} characters`,
      );
      expect(() => createSpeechMatcher({ regex: 'a'.repeat(MAX_REGEX_LENGTH) })).not.toThrow();
    });
  });
});
