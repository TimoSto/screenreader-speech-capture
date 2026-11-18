import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { NavItem } from '#lib/core/navigation.js';
import NavRail from './NavRail.svelte';

const items: NavItem[] = [
  { href: '/ui', label: 'Monitor', icon: 'monitor', exact: true },
  { href: '/ui/settings', label: 'Settings', icon: 'settings' },
  { href: '/ui/setup', label: 'Setup', icon: 'build' },
];

describe('NavRail', () => {
  it('lists the three pages in a labelled navigation', async () => {
    await render(NavRail, { items, currentPath: '/ui' });
    const nav = page.getByRole('navigation', { name: 'Pages' });
    await expect.element(nav.getByRole('link', { name: 'Monitor' })).toBeInTheDocument();
    await expect.element(nav.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    await expect.element(nav.getByRole('link', { name: 'Setup' })).toBeInTheDocument();
  });

  it.each([
    ['/ui/', 'Monitor'],
    ['/ui/settings', 'Settings'],
    ['/ui/setup', 'Setup'],
  ])('marks only the page of %s as current', async (currentPath, name) => {
    await render(NavRail, { items, currentPath });
    await expect.element(page.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
    const current = page
      .getByRole('link')
      .elements()
      .filter((e) => e.ariaCurrent === 'page');
    expect(current).toHaveLength(1);
  });
});
