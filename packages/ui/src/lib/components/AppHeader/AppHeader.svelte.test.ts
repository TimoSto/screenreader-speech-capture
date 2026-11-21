import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import AppHeader from './AppHeader.svelte';

const props = (patch: Partial<Parameters<typeof render<typeof AppHeader>>[1]> = {}) => ({
  host: '127.0.0.1:5151',
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
});
