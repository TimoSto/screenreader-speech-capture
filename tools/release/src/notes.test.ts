import { describe, expect, it } from 'vitest';
import { config } from './config.js';
import { renderNotes } from './notes.js';
import type { PackagePlan } from './plan.js';

const plan = (entries: PackagePlan['entries']): PackagePlan => ({
  pkg: config.packages[0]!,
  last: '1.2.3',
  bump: 'minor',
  version: '1.3.0',
  entries,
});

describe('renderNotes', () => {
  it('groups entries by kind, breaking first, linking the PR or the short SHA', () => {
    expect(
      renderNotes(
        plan([
          { kind: 'fix', description: 'stop leaking sockets', pr: 12, sha: 'a'.repeat(40) },
          { kind: 'feature', description: 'add sessions', pr: null, sha: 'b1c2d3e4f5' },
          { kind: 'breaking', description: 'drop API 0.x', pr: 9, sha: 'c'.repeat(40) },
        ]),
      ),
    ).toBe(
      [
        '### Breaking changes',
        '',
        '- drop API 0.x (#9)',
        '',
        '### Features',
        '',
        '- add sessions (b1c2d3e)',
        '',
        '### Fixes',
        '',
        '- stop leaking sockets (#12)',
        '',
        'Previous release: `screenreader-speech-capture@1.2.3`',
        '',
      ].join('\n'),
    );
  });

  it('leaves out empty sections', () => {
    expect(
      renderNotes(plan([{ kind: 'fix', description: 'x', pr: 1, sha: 'd'.repeat(40) }])),
    ).not.toContain('###  Features');
    expect(renderNotes(plan([{ kind: 'fix', description: 'x', pr: 1, sha: 'd'.repeat(40) }]))).toBe(
      '### Fixes\n\n- x (#1)\n\nPrevious release: `screenreader-speech-capture@1.2.3`\n',
    );
  });
});
