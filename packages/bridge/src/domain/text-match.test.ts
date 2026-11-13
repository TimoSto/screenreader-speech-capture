import { describe, expect, it } from 'vitest';
import { AppError } from './errors.js';
import type { SpeechEntry } from './speech-entry.js';
import { createSpeechMatcher } from './text-match.js';

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
});
