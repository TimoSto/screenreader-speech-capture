import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { deriveChips } from '#lib/core/status.js';
import AppHeader from './AppHeader.svelte';

const props = (patch: Partial<Parameters<typeof render<typeof AppHeader>>[1]> = {}) => ({
  host: '127.0.0.1:5151',
  chips: deriveChips(null, false),
  announcement: '',
  loading: false,
  onRetry: () => {},
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

  it('refreshes and toggles the theme from its buttons', async () => {
    const onRetry = vi.fn();
    const onToggleTheme = vi.fn();
    await render(AppHeader, props({ onRetry, onToggleTheme }));
    await page.getByTitle('Refresh status').click();
    await page.getByRole('button', { name: 'Switch to dark theme' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onToggleTheme).toHaveBeenCalledTimes(1);
  });

  it('names the theme switch after the theme it switches to', async () => {
    await render(AppHeader, props({ theme: 'dark' }));
    await expect
      .element(page.getByRole('button', { name: 'Switch to light theme' }))
      .toBeInTheDocument();
  });
});
