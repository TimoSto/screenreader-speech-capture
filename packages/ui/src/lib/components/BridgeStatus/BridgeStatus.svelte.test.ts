import { describe, expect, it, vi } from 'vitest';
import { page as view } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { createAppStores } from '#lib/composition.js';
import { withAppStores } from '../../../test/app-stores.js';
import BridgeStatus from './BridgeStatus.svelte';

describe('BridgeStatus', () => {
  it('shows the bridge as unreachable, with a retry, when the status cannot be read', async () => {
    await render(BridgeStatus, withAppStores());
    await expect.element(view.getByRole('list', { name: 'Bridge status' })).toBeInTheDocument();
    await expect.element(view.getByTitle('Refresh status')).toBeInTheDocument();
  });

  it('retries the store from the button', async () => {
    const stores = createAppStores();
    await render(BridgeStatus, withAppStores({}, stores));
    const retry = vi.spyOn(stores.status, 'retry');
    await view.getByTitle('Refresh status').click();
    expect(retry).toHaveBeenCalledTimes(1);
    retry.mockRestore();
  });
});
