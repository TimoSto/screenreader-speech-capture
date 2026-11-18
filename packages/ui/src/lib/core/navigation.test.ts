import { describe, expect, it } from 'vitest';
import { isCurrent } from './navigation.js';

describe('isCurrent', () => {
  it('ignores a trailing slash', () => {
    expect(isCurrent({ href: '/ui', exact: true }, '/ui/')).toBe(true);
    expect(isCurrent({ href: '/ui/', exact: true }, '/ui')).toBe(true);
  });

  it('matches an exact item only on its own path', () => {
    expect(isCurrent({ href: '/ui', exact: true }, '/ui/settings')).toBe(false);
  });

  it('matches a prefix item on its sub-paths but not on look-alikes', () => {
    expect(isCurrent({ href: '/ui/settings' }, '/ui/settings/keys')).toBe(true);
    expect(isCurrent({ href: '/ui/settings' }, '/ui/settings-old')).toBe(false);
    expect(isCurrent({ href: '/ui/settings' }, '/ui/setup')).toBe(false);
  });
});
