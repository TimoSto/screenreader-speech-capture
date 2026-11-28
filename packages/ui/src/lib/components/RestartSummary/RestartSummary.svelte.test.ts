import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { THEMES } from '#lib/core/theme.js';
import { waitingForRestart } from '#lib/core/settings.js';
import '#lib/styles/tokens.css';
import { configWith } from '../../../test/config.js';
import RestartSummary from './RestartSummary.svelte';

const changes = waitingForRestart(
  configWith(),
  configWith({ tcp: { port: 4450 }, log: { consoleSpeech: true } }),
  {},
  { runningPlaywright: '1.65.0' },
);

const props = (patch: Record<string, unknown> = {}) => ({
  changes,
  reachable: true,
  onCheck: () => Promise.resolve(),
  ...patch,
});

const check = () => page.getByRole('button', { name: 'Check again' });

describe('RestartSummary', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('shows nothing while nothing waits', async () => {
    await render(RestartSummary, props({ changes: [] }));
    expect(page.getByRole('heading').elements()).toHaveLength(0);
    expect(page.getByRole('button').elements()).toHaveLength(0);
  });

  it('lists every change, also one without a field, and what a restart costs', async () => {
    await render(RestartSummary, props());
    await expect
      .element(page.getByRole('heading', { name: '2 changes wait for a restart' }))
      .toBeInTheDocument();
    const [port, unlisted] = page.getByRole('listitem').elements();
    expect(port.textContent).toContain('TCP port: ');
    expect(port.textContent).toContain('4449 → 4450.');
    expect(port.textContent).toContain('text-to-socket-engine-add-voice');
    expect(unlisted.textContent).toContain('log.consoleSpeech:');
    await expect
      .element(page.getByText(/empties the recorded speech and sessions/))
      .toBeInTheDocument();
  });

  it('checks again and says what still waits', async () => {
    const onCheck = vi.fn(() => Promise.resolve());
    await render(RestartSummary, props({ onCheck }));
    await check().click();
    expect(onCheck).toHaveBeenCalled();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Checked: 2 changes wait for a restart.');
  });

  it('says when the bridge is not reachable', async () => {
    await render(RestartSummary, props({ reachable: false }));
    await check().click();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('The bridge is not reachable.');
  });

  it('moves the focus to the answer when the last change is gone', async () => {
    let done: () => void = () => {};
    const screen = await render(
      RestartSummary,
      props({ onCheck: () => new Promise<void>((resolve) => (done = resolve)) }),
    );
    await check().click();
    await screen.rerender({ changes: [] });
    done();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('No changes wait for a restart.');
    await expect.element(page.getByRole('status')).toHaveFocus();
  });

  it.each(THEMES.map((theme) => theme.value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      const { container } = await render(RestartSummary, props());
      const results = await axe.run(container);
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
