import { describe, expect, it } from 'vitest';
import { bumpOf, maxBump, parseTitle } from './conventional.js';

describe('parseTitle', () => {
  it('parses type, scopes, breaking marker and PR suffix', () => {
    expect(parseTitle('fix(bridge, client)!: drop the old status field (#21)')).toEqual({
      type: 'fix',
      scopes: ['bridge', 'client'],
      breaking: true,
      description: 'drop the old status field',
      pr: 21,
    });
  });

  it('parses a title without scope or PR number', () => {
    expect(parseTitle('docs: fix a typo')).toEqual({
      type: 'docs',
      scopes: [],
      breaking: false,
      description: 'fix a typo',
      pr: null,
    });
  });

  it.each([
    'Initial commit: design README',
    'feat(bridge) missing colon',
    'feat:no space',
    'Feat: x',
  ])('rejects %j', (title) => {
    expect(parseTitle(title)).toBeNull();
  });
});

describe('bumpOf', () => {
  it.each([
    ['feat(bridge): x', 'minor'],
    ['fix(bridge): x', 'patch'],
    ['perf(bridge): x', 'patch'],
    ['refactor(bridge)!: x', 'major'],
    ['refactor(bridge): x', null],
    ['docs: x', null],
  ])('%s → %s', (title, bump) => {
    const parsed = parseTitle(title);
    expect(parsed && bumpOf(parsed)).toBe(bump);
  });
});

describe('maxBump', () => {
  it('returns the larger bump and ignores null', () => {
    expect(maxBump('patch', 'minor')).toBe('minor');
    expect(maxBump('major', 'minor')).toBe('major');
    expect(maxBump(null, 'patch')).toBe('patch');
    expect(maxBump(null, null)).toBeNull();
  });
});
