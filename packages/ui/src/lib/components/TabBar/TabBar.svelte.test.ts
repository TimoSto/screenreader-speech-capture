import axe from 'axe-core';
import { afterEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { THEMES } from '#lib/core/theme.js';
import '#lib/styles/tokens.css';
import '#lib/styles/global.css';
import TabBar from './TabBar.svelte';

const items = [
  { href: '/ui/setup', label: 'Check', exact: true },
  { href: '/ui/setup/instructions', label: 'Instructions' },
];
const props = (currentPath = '/ui/setup') => ({ label: 'Setup', items, currentPath });

describe('TabBar', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('is a named navigation of links', async () => {
    await render(TabBar, props());
    const nav = page.getByRole('navigation', { name: 'Setup' });
    await expect
      .element(nav.getByRole('link', { name: 'Instructions' }))
      .toHaveAttribute('href', '/ui/setup/instructions');
  });

  it.each([
    ['/ui/setup', 'Check'],
    ['/ui/setup/instructions', 'Instructions'],
  ])('marks only the page at %s as current', async (path, name) => {
    await render(TabBar, props(path));
    const current = document.querySelectorAll('[aria-current="page"]');
    expect([...current].map((link) => link.textContent.trim())).toEqual([name]);
  });

  it.each(THEMES.map(({ value }) => value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      const { container } = await render(TabBar, props());
      const results = await axe.run(container);
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
