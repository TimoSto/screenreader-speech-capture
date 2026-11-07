import { describe, expect, it } from 'vitest';
import { AppError } from './errors.js';
import type { SpeechEntry } from './speech-entry.js';
import { createSpeechMatcher, normalizeText } from './text-match.js';

function entry(text: string, kind: SpeechEntry['kind'] = 'speech'): SpeechEntry {
  return {
    seq: 1,
    kind,
    text,
    receivedAt: new Date(0),
    monotonicMs: 0,
    source: 'tcp',
    voice: null,
    connectionId: 1,
  };
}

describe('createSpeechMatcher', () => {
  it('matches a substring', () => {
    const match = createSpeechMatcher({ contains: 'Submit, button' });
    expect(match(entry('Form  Submit, button'))).toBe(true);
    expect(match(entry('submit, button'))).toBe(false);
  });

  it('normalizes case and whitespace on both sides', () => {
    const match = createSpeechMatcher({ contains: 'SUBMIT,   Button ', normalize: true });
    expect(match(entry('Form submit,\tbutton'))).toBe(true);
  });

  it('matches a regex, case-insensitive with normalize', () => {
    expect(createSpeechMatcher({ regex: '^Edit, \\w+' })(entry('Edit, Name, blank'))).toBe(true);
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
});

describe('normalizeText', () => {
  it('lower-cases and collapses whitespace', () => {
    expect(normalizeText('  A\r\n  b  ')).toBe('a b');
  });
});
