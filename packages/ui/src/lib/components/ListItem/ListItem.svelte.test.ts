import axe from 'axe-core';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ListItem from './ListItem.svelte';

const text = (html: string) => createRawSnippet(() => ({ render: () => html }));
const subtitle = text('<span>#7 · 4 s</span>');

describe('ListItem', () => {
  it('shows the title and the subtitle', async () => {
    await render(ListItem, { title: 'checkout test', subtitle, onSelect: () => {} });
    await expect.element(page.getByText('checkout test')).toBeVisible();
    await expect.element(page.getByText('#7 · 4 s')).toBeVisible();
  });

  it('is an option that says whether it is selected', async () => {
    const screen = await render(ListItem, { title: 'a', selected: true, onSelect: () => {} });
    const option = page.getByRole('option', { name: 'a' });
    await expect.element(option).toHaveAttribute('aria-selected', 'true');
    await screen.rerender({ title: 'a', selected: false, onSelect: () => {} });
    await expect.element(option).toHaveAttribute('aria-selected', 'false');
  });

  it('shows an eye only while selected, without moving the title', async () => {
    const screen = await render(ListItem, { title: 'a', onSelect: () => {} });
    const left = () => document.querySelector('.title')!.getBoundingClientRect().left;
    const unselected = left();
    expect(document.querySelector('md-icon')).toBeNull();
    await screen.rerender({ title: 'a', selected: true, onSelect: () => {} });
    expect(document.querySelector('md-icon')?.textContent).toBe('visibility');
    expect(left()).toBe(unselected);
  });

  it('is named by its texts, not by the icon', async () => {
    await render(ListItem, { title: 'a', selected: true, onSelect: () => {} });
    const option = document.querySelector('[role="option"]')!;
    // On the attribute: Playwright computes the name without the icon text either way.
    const named = option.getAttribute('aria-labelledby')!.split(' ');
    expect(named.map((id) => document.getElementById(id)?.textContent)).toEqual(['a']);
  });

  it('has the corner radius of md-list-item (8px)', async () => {
    await render(ListItem, { title: 'a', onSelect: () => {} });
    expect(getComputedStyle(document.querySelector('.option')!).borderRadius).toBe('8px');
  });

  it('takes another corner radius through shape', async () => {
    await render(ListItem, { title: 'a', shape: '28px', onSelect: () => {} });
    expect(getComputedStyle(document.querySelector('.option')!).borderRadius).toBe('28px');
  });

  it.each([
    ['Space', ' '],
    ['Enter', '{Enter}'],
  ])('is selected once with %s', async (_, keys) => {
    const onSelect = vi.fn();
    await render(ListItem, { title: 'a', onSelect });
    document.querySelector('button')!.focus();
    await userEvent.keyboard(keys);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onSelect when the row is clicked', async () => {
    const onSelect = vi.fn();
    await render(ListItem, { title: 'a', onSelect });
    await page.getByRole('option', { name: 'a' }).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('speaks the description instead of the visual subtitle', async () => {
    await render(ListItem, {
      title: 'a',
      subtitle,
      description: 'Session 7, 4 seconds',
      onSelect: () => {},
    });
    await expect
      .element(page.getByRole('option', { name: 'a Session 7, 4 seconds' }))
      .toBeInTheDocument();
    expect(document.querySelector('.subtitle')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the subtitle readable without a description', async () => {
    await render(ListItem, { title: 'a', subtitle, onSelect: () => {} });
    expect(document.querySelector('.subtitle')?.hasAttribute('aria-hidden')).toBe(false);
    await expect.element(page.getByRole('option', { name: 'a #7 · 4 s' })).toBeInTheDocument();
  });

  it('has no accessibility violations inside a listbox', async () => {
    const list = document.body.appendChild(document.createElement('div'));
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Things');
    await render(ListItem, {
      target: list,
      props: { title: 'a', subtitle, selected: true, onSelect: () => {} },
    });
    // The icon's ligature text is a glyph, not a visible label.
    const results = await axe.run(list, {
      rules: { 'label-content-name-mismatch': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    list.remove();
  });
});
