import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import StatusRefresh from './StatusRefresh.svelte';

describe('StatusRefresh', () => {
  it('calls onRetry once per click', async () => {
    const onRetry = vi.fn();
    await render(StatusRefresh, { loading: false, onRetry });
    await page.getByTitle('Refresh status').click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('spins the icon only while loading', async () => {
    const screen = await render(StatusRefresh, { loading: false, onRetry: () => {} });
    const icon = document.querySelector('md-icon');
    expect(icon?.classList.contains('spin')).toBe(false);
    await screen.rerender({ loading: true, onRetry: () => {} });
    expect(icon?.classList.contains('spin')).toBe(true);
  });
});
