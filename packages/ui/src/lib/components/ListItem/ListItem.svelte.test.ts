import axe from 'axe-core';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ListItem from './ListItem.svelte';

const text = (html: string) => createRawSnippet(() => ({ render: () => html }));
const subtitle = text('<span>#7 · 4 s</span>');
const trailing = text('<button type="button">Stop</button>');

describe('ListItem', () => {
  it('shows the title and the subtitle', async () => {
    await render(ListItem, { title: 'checkout test', subtitle, onSelect: () => {} });
    await expect.element(page.getByText('checkout test')).toBeVisible();
    await expect.element(page.getByText('#7 · 4 s')).toBeVisible();
  });

  it('marks the selected row with aria-current and no other', async () => {
    const screen = await render(ListItem, { title: 'a', selected: true, onSelect: () => {} });
    const button = page.getByRole('button', { name: 'a' });
    await expect.element(button).toHaveAttribute('aria-current', 'true');
    await screen.rerender({ title: 'a', selected: false, onSelect: () => {} });
    await expect.element(button).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect when the row is clicked', async () => {
    const onSelect = vi.fn();
    await render(ListItem, { title: 'a', onSelect });
    await page.getByRole('button', { name: 'a' }).click();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('puts the ripple first, so it lies under everything and covers the trailing action', async () => {
    await render(ListItem, { title: 'a', trailing, onSelect: () => {} });
    expect(document.querySelector('li')?.firstElementChild?.localName).toBe('md-ripple');
  });

  it('renders the trailing action beside the select button, not inside it', async () => {
    const onSelect = vi.fn();
    await render(ListItem, { title: 'a', trailing, onSelect });
    expect(document.querySelector('li > button.select button')).toBeNull();
    await page.getByRole('button', { name: 'Stop' }).click();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('leaves out the trailing space when there is no trailing action', async () => {
    await render(ListItem, { title: 'a', onSelect: () => {} });
    expect(document.querySelector('.trailing')).toBeNull();
  });

  it('speaks the description instead of the visual subtitle', async () => {
    await render(ListItem, {
      title: 'a',
      subtitle,
      description: 'Session 7, 4 seconds',
      onSelect: () => {},
    });
    await expect
      .element(page.getByRole('button', { name: 'a Session 7, 4 seconds' }))
      .toBeInTheDocument();
    expect(document.querySelector('.subtitle')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('leaves the subtitle readable without a description', async () => {
    await render(ListItem, { title: 'a', subtitle, onSelect: () => {} });
    expect(document.querySelector('.subtitle')?.hasAttribute('aria-hidden')).toBe(false);
    await expect.element(page.getByRole('button', { name: 'a #7 · 4 s' })).toBeInTheDocument();
  });

  it('has no accessibility violations inside a list', async () => {
    const list = document.body.appendChild(document.createElement('ul'));
    list.setAttribute('aria-label', 'Things');
    await render(ListItem, {
      target: list,
      props: { title: 'a', subtitle, trailing, selected: true, onSelect: () => {} },
    });
    const results = await axe.run(list);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
    list.remove();
  });
});
