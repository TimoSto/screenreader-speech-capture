import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
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

  const link = (name: string) => page.getByRole('link', { name, exact: true });

  // Checked on the attribute: Playwright computes the name without the icon text either way.
  it('names every link by its visible label alone', async () => {
    await render(NavRail, { items, currentPath: '/ui' });
    const names = page
      .getByRole('link')
      .elements()
      .map((e) => document.getElementById(e.getAttribute('aria-labelledby')!)?.textContent);
    expect(names).toEqual(['Monitor', 'Settings', 'Setup']);
  });

  it('has every link in the tab order', async () => {
    await render(NavRail, { items, currentPath: '/ui/settings' });
    for (const { label } of items) {
      await userEvent.tab();
      await expect.element(link(label)).toHaveFocus();
    }
  });

  it('moves between the links with the arrow keys', async () => {
    await render(NavRail, { items, currentPath: '/ui' });
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(link('Settings')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect.element(link('Setup')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    await expect.element(link('Settings')).toHaveFocus();
  });

  it.each([
    ['Space', ' '],
    ['Enter', '{Enter}'],
  ])('activates the focused link once with %s', async (_, keys) => {
    await render(NavRail, { items, currentPath: '/ui' });
    const element = link('Settings').element() as HTMLAnchorElement;
    // Keeps the test page where it is.
    const clicked = vi.fn((event: Event) => event.preventDefault());
    element.addEventListener('click', clicked);
    element.focus();
    await userEvent.keyboard(keys);
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it('keeps every label inside its link at twice the text size', async () => {
    const root = document.documentElement;
    root.style.fontSize = '32px';
    // The tokens aren't loaded here.
    root.style.setProperty('--app-rail-width', '80px');
    root.style.setProperty('--md-sys-typescale-label-medium-size', '0.75rem');
    try {
      await render(NavRail, { items, currentPath: '/ui' });
      for (const element of page.getByRole('link').elements()) {
        const label = element.querySelector<HTMLElement>('.label')!;
        const outer = element.getBoundingClientRect();
        const inner = label.getBoundingClientRect();
        expect(getComputedStyle(label).fontSize).toBe('24px');
        expect(inner.left).toBeGreaterThanOrEqual(outer.left);
        expect(inner.right).toBeLessThanOrEqual(outer.right);
        expect(label.scrollWidth).toBeLessThanOrEqual(label.clientWidth);
      }
    } finally {
      root.removeAttribute('style');
    }
  });
});
