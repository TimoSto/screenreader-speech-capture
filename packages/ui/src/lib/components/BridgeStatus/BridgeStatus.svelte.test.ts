import { describe, expect, it, vi } from 'vitest';
import { page as view } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { statusStore } from '#lib/composition.js';
import BridgeStatus from './BridgeStatus.svelte';

describe('BridgeStatus', () => {
  it('shows the status chips and the refresh button', async () => {
    await render(BridgeStatus);
    await expect.element(view.getByRole('list', { name: 'Bridge status' })).toBeInTheDocument();
    await expect.element(view.getByTitle('Refresh status')).toBeInTheDocument();
  });

  it('refreshes the store from the button', async () => {
    await render(BridgeStatus);
    const retry = vi.spyOn(statusStore, 'retry');
    await view.getByTitle('Refresh status').click();
    expect(retry).toHaveBeenCalledTimes(1);
    retry.mockRestore();
  });
});
