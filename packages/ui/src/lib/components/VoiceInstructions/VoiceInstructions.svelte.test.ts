import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { THEMES } from '#lib/core/theme.js';
import '#lib/styles/tokens.css';
import '#lib/styles/global.css';
import VoiceInstructions from './VoiceInstructions.svelte';

const props = (port = 4449) => ({
  tcp: { host: '127.0.0.1', port },
  version: '0.9.0',
  onCopy: vi.fn(() => Promise.resolve(true)),
});

describe('VoiceInstructions', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('installs and selects the default voice', async () => {
    await render(VoiceInstructions, props());
    await expect.element(page.getByText(/text-to-socket-engine-register/)).toBeVisible();
    await expect
      .element(page.getByText('Under Voice, select Text To Socket 127.0.0.1:4449.'))
      .toBeVisible();
    expect(
      page.getByRole('button', { name: 'Copy the add-voice command' }).elements(),
    ).toHaveLength(0);
  });

  it('adds a voice for another port and names it in the steps', async () => {
    const given = props(5000);
    await render(VoiceInstructions, given);
    await page.getByRole('button', { name: 'Copy the add-voice command' }).click();
    expect(given.onCopy).toHaveBeenCalledWith(expect.stringContaining('127.0.0.1 5000'));
    await expect
      .element(page.getByText('Under Voice, select Text To Socket 127.0.0.1:5000.'))
      .toBeVisible();
  });

  it('shows the default voice while the bridge is unknown', async () => {
    await render(VoiceInstructions, { ...props(), tcp: null, version: null });
    await expect
      .element(page.getByText('Under Voice, select Text To Socket 127.0.0.1:4449.'))
      .toBeVisible();
  });

  it('has a heading the check can jump to', async () => {
    await render(VoiceInstructions, props());
    const heading = page.getByRole('heading', { name: 'Screen reader' }).element() as HTMLElement;
    expect(heading.id).toBe('screen-reader-heading');
    heading.focus();
    expect(document.activeElement).toBe(heading);
  });

  it.each(THEMES.map(({ value }) => value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      const { container } = await render(VoiceInstructions, props(5000));
      const results = await axe.run(container, {
        rules: { 'label-content-name-mismatch': { enabled: false } },
      });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
