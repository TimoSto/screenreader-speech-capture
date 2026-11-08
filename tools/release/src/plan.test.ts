import { describe, expect, it } from 'vitest';
import type { ReleasePackage } from './config.js';
import { renderNotes } from './notes.js';
import { planPreview, planRelease } from './plan.js';

const bridge: ReleasePackage = {
  scope: 'bridge',
  name: 'screenreader-speech-capture',
  dir: 'packages/bridge',
};

/** Newest first, like `git log`. */
const commits = [
  { sha: 'c'.repeat(40), subject: 'feat(bridge,client): markers in the SSE stream (#23)' },
  { sha: 'b'.repeat(40), subject: 'fix(client): reconnect after a bridge restart (#22)' },
  { sha: 'a'.repeat(40), subject: 'docs: explain the firewall rule (#21)' },
  { sha: '9'.repeat(40), subject: 'fix(bridge): keep the TCP socket open' },
  { sha: '8'.repeat(40), subject: 'Merge branch main' },
];

describe('planRelease', () => {
  it('uses only commits naming the package, with the highest bump', () => {
    const plan = planRelease(bridge, '0.0.1-preview.5', commits);
    expect(plan.bump).toBe('minor');
    expect(plan.version).toBe('0.1.0');
    expect(plan.entries.map((e) => e.description)).toEqual([
      'keep the TCP socket open',
      'markers in the SSE stream',
    ]);
  });

  it('releases a fix after previews as the previewed base', () => {
    expect(planRelease(bridge, '0.0.1-preview.5', commits.slice(3)).version).toBe('0.0.1');
  });

  it('releases nothing without a releasable commit for the package', () => {
    const plan = planRelease(bridge, '0.1.0', commits.slice(1, 3));
    expect(plan.version).toBeNull();
    expect(plan.entries).toEqual([]);
  });

  it('rejects an invalid last version', () => {
    expect(() => planRelease(bridge, '0.0.0-stage', [])).toThrow(/not a valid version/);
  });
});

describe('planPreview', () => {
  it('previews the next version with the branch slug and run number', () => {
    const plan = planPreview(bridge, '0.1.0', commits, true, 'feat-markers', 42);
    expect(plan.version).toBe('0.2.0-feat-markers.42');
  });

  it('falls back to a patch when no commit title names the package', () => {
    const plan = planPreview(
      bridge,
      '0.1.0',
      [{ sha: 'e'.repeat(40), subject: 'wip' }],
      true,
      'x',
      3,
    );
    expect(plan.bump).toBe('patch');
    expect(plan.version).toBe('0.1.1-x.3');
  });

  it('skips a package that did not change on the branch', () => {
    expect(planPreview(bridge, '0.1.0', commits, false, 'x', 3).version).toBeNull();
  });
});

describe('renderNotes', () => {
  it('groups entries and links PRs or commits', () => {
    const plan = planRelease(bridge, '0.1.0', [
      { sha: 'd'.repeat(40), subject: 'refactor(bridge)!: rename `--port` (#30)' },
      ...commits,
    ]);
    expect(plan.version).toBe('1.0.0');
    expect(renderNotes(plan)).toBe(
      [
        '### Breaking changes',
        '',
        '- rename `--port` (#30)',
        '',
        '### Features',
        '',
        '- markers in the SSE stream (#23)',
        '',
        '### Fixes',
        '',
        '- keep the TCP socket open (9999999)',
        '',
        'Previous release: `screenreader-speech-capture@0.1.0`',
        '',
      ].join('\n'),
    );
  });
});
