import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { THEMES } from '#lib/core/theme.js';
import '#lib/styles/tokens.css';
import '#lib/styles/global.css';
import CommandBlock from './CommandBlock.svelte';

const props = (onCopy = vi.fn(() => Promise.resolve(true))) => ({
  label: 'the install commands',
  text: 'npm install -g text-to-socket-engine',
  onCopy,
});
const copy = () => page.getByRole('button', { name: 'Copy the install commands' });

describe('CommandBlock', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('copies its text and says so', async () => {
    const given = props();
    await render(CommandBlock, given);
    await copy().click();
    expect(given.onCopy).toHaveBeenCalledWith('npm install -g text-to-socket-engine');
    await expect.element(page.getByRole('status')).toHaveTextContent('Copied.');
  });

  it('says what to do when copying fails', async () => {
    await render(CommandBlock, props(vi.fn(() => Promise.resolve(false))));
    await copy().click();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Copying failed: select the text and copy it.');
  });

  it('forgets the result when the command changes', async () => {
    const { rerender } = await render(CommandBlock, props());
    await copy().click();
    await expect.element(page.getByRole('status')).toHaveTextContent('Copied.');
    await rerender({ text: 'another command' });
    await expect.element(page.getByRole('status')).toHaveTextContent('');
  });

  it.each(THEMES.map(({ value }) => value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      const { container } = await render(CommandBlock, props());
      const results = await axe.run(container, {
        rules: { 'label-content-name-mismatch': { enabled: false } },
      });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
