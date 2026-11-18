import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AppHeader from './AppHeader.svelte';

const props = (patch: Partial<Parameters<typeof render<typeof AppHeader>>[1]> = {}) => ({
  host: '127.0.0.1:5151',
  theme: 'light' as const,
  onToggleTheme: () => {},
  ...patch,
});

describe('AppHeader', () => {
  it('shows the title, the host and the status chips', async () => {
    await render(AppHeader, props());
    await expect.element(page.getByText('Speech Capture')).toBeInTheDocument();
    await expect.element(page.getByText('127.0.0.1:5151')).toBeInTheDocument();
    await expect.element(page.getByRole('list', { name: 'Bridge status' })).toBeInTheDocument();
  });

  it('starts with the logo', async () => {
    const { container } = await render(AppHeader, props());
    expect(container.querySelector('header > .logo-slot .logo svg')).not.toBeNull();
  });

  it('toggles the theme from its button', async () => {
    const onToggleTheme = vi.fn();
    await render(AppHeader, props({ onToggleTheme }));
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('names the theme switch after the theme it switches to', async () => {
    await render(AppHeader, props({ theme: 'dark' }));
    await expect
      .element(page.getByRole('button', { name: 'Switch to light theme' }))
      .toBeInTheDocument();
  });
});
