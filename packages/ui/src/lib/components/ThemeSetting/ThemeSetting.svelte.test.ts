import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import ThemeSetting from './ThemeSetting.svelte';

describe('ThemeSetting', () => {
  it('is a radio group of the four themes with the current one checked', async () => {
    await render(ThemeSetting, { value: 'dark', onChange: () => {} });
    await expect.element(page.getByRole('group', { name: 'Color theme' })).toBeInTheDocument();
    await expect.element(page.getByRole('radio')).toHaveLength(4);
    await expect.element(page.getByRole('radio', { name: /^Dark Default/ })).toBeChecked();
    await expect.element(page.getByRole('radio', { name: /^Light Default/ })).not.toBeChecked();
    await expect
      .element(page.getByRole('radio', { name: /^High contrast White/ }))
      .toBeInTheDocument();
    await expect
      .element(page.getByRole('radio', { name: /^Dark high contrast Black/ }))
      .toBeInTheDocument();
  });

  it('reports the chosen theme on click', async () => {
    const onChange = vi.fn();
    await render(ThemeSetting, { value: 'light', onChange });
    await page.getByRole('radio', { name: /^High contrast White/ }).click({ force: true });
    expect(onChange).toHaveBeenCalledWith('high-contrast');
  });

  it('is operable with the arrow keys', async () => {
    const onChange = vi.fn();
    await render(ThemeSetting, { value: 'light', onChange });
    (page.getByRole('radio', { name: /^Light Default/ }).element() as HTMLElement).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(onChange).toHaveBeenCalledWith('dark');
  });
});
