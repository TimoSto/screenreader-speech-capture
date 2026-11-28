import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { deriveCheckRows } from '#lib/core/setup.js';
import { THEMES } from '#lib/core/theme.js';
import '#lib/styles/tokens.css';
import '#lib/styles/global.css';
import { statusWith } from '../../../test/status.js';
import SetupStatus from './SetupStatus.svelte';

const off = { available: false, backend: null, reason: 'only on Windows' };
const rows = deriveCheckRows(statusWith({ input: { native: off, focus: off } }));

const props = (patch: Record<string, unknown> = {}) => ({
  rows,
  reachable: true,
  onCheck: () => Promise.resolve(),
  ...patch,
});

describe('SetupStatus', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('says every state in words, and a warning as one', async () => {
    await render(SetupStatus, props());
    const items = page.getByRole('listitem').elements();
    expect(items).toHaveLength(6);
    expect(items[0].textContent).toContain('Listening on port 4449 (windows-1252)');
    expect(items[2].textContent).toContain('Warning: Not available: only on Windows');
  });

  it('links to the docs only where something is not ok', async () => {
    await render(SetupStatus, props());
    const links = page.getByRole('link').elements();
    expect(links).toHaveLength(3);
    await expect
      .element(page.getByRole('link', { name: 'Select the voice (help for Voice connected)' }))
      .toHaveAttribute('href', expect.stringContaining('usage/vm-setup.md#screen-reader-setup'));
  });

  it('links the libraries to their repositories', async () => {
    await render(SetupStatus, props({ rows: deriveCheckRows(statusWith()) }));
    await expect
      .element(page.getByRole('link', { name: 'robotjs on GitHub' }))
      .toHaveAttribute('href', 'https://github.com/jitsi/robotjs');
    await expect
      .element(page.getByRole('link', { name: 'koffi on GitHub' }))
      .toHaveAttribute('href', 'https://github.com/Koromix/koffi');
    expect(page.getByRole('listitem').elements()[2].textContent).toMatch(/Available\s+\(robotjs/);
  });

  it('checks again and says what it found', async () => {
    const onCheck = vi.fn(() => Promise.resolve());
    await render(SetupStatus, props({ onCheck }));
    await page.getByRole('button', { name: 'Check again' }).click();
    expect(onCheck).toHaveBeenCalledOnce();
    await expect.element(page.getByRole('status')).toHaveTextContent('Checked: 2 warnings.');
  });

  it('says that the status is being read', async () => {
    await render(SetupStatus, props({ rows: null }));
    await expect.element(page.getByText('Reading the status…')).toBeVisible();
  });

  it('says that the bridge is gone, keeps the last state and offers to try again', async () => {
    await render(SetupStatus, props({ reachable: false }));
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('The bridge is not reachable. This is the last state that was read.');
    await expect.element(page.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(page.getByRole('listitem').elements()).toHaveLength(6);
  });

  it.each(THEMES.map(({ value }) => value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      const { container } = await render(SetupStatus, props());
      const results = await axe.run(container);
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
