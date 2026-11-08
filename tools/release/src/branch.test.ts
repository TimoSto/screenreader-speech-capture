import { describe, expect, it } from 'vitest';
import { slugify } from './branch.js';

describe('slugify', () => {
  it.each([
    ['feat/Markers_X', 'feat-markers-x'],
    ['docs/versions', 'docs-versions'],
    ['--Fix--it--', 'fix-it'],
    ['renovate/@types/node-22.x', 'renovate-types-node-22-x'],
    ['a'.repeat(39) + '/b', 'a'.repeat(39)],
    ['___', 'branch'],
    ['0123', 'b0123'],
  ])('%s → %s', (branch, slug) => {
    expect(slugify(branch)).toBe(slug);
  });
});
