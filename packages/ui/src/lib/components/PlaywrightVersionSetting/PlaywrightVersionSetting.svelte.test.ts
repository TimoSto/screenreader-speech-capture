import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import PlaywrightVersionSetting from './PlaywrightVersionSetting.svelte';

const props = (patch: Record<string, unknown> = {}) => ({
  active: null,
  saved: null,
  running: '1.65.0',
  overriddenBy: null,
  onSave: () => Promise.resolve(),
  ...patch,
});

/** The real `<input>` is inside the text field's shadow root. */
const field = () => page.getByRole('textbox', { name: 'Playwright version' });
const status = () => page.getByRole('status').element().textContent.replace(/\s+/g, ' ');

describe('PlaywrightVersionSetting', () => {
  it('is empty for the bundled version and names the one that runs', async () => {
    await render(PlaywrightVersionSetting, props());
    await expect.element(field()).toHaveValue('');
    await expect.element(page.getByText('In use: bundled version (1.65.0)')).toBeInTheDocument();
    expect(page.getByText(/Restart the bridge/).elements()).toHaveLength(0);
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('leaves the number out while the status is unknown', async () => {
    await render(PlaywrightVersionSetting, props({ running: null }));
    await expect.element(page.getByText('In use: bundled version')).toBeInTheDocument();
  });

  it('shows the configured version', async () => {
    await render(PlaywrightVersionSetting, props({ active: '1.64.0', saved: '1.64.0' }));
    await expect.element(field()).toHaveValue('1.64.0');
    await expect.element(page.getByText('In use: 1.64.0')).toBeInTheDocument();
  });

  it('saves a typed version', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(PlaywrightVersionSetting, props({ onSave }));
    await field().fill(' 1.66.0 ');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith('1.66.0');
  });

  it('saves the bundled version when the field is emptied', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(PlaywrightVersionSetting, props({ active: '1.64.0', saved: '1.64.0', onSave }));
    await field().fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('refuses a version range without asking the bridge', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(PlaywrightVersionSetting, props({ onSave }));
    await field().fill('^1.65.0');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect
      .element(
        page.getByText('Enter an exact version like 1.65.0, or leave the field empty.').first(),
      )
      .toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the bridge message when saving fails and keeps what was typed', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('The config file is read-only')));
    await render(PlaywrightVersionSetting, props({ onSave }));
    await field().fill('1.66.0');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => page.getByRole('alert').element().textContent).toContain('read-only');
    await expect.element(field()).toHaveValue('1.66.0');
  });

  it('announces that a restart is needed for a new version', async () => {
    await render(PlaywrightVersionSetting, props({ saved: '1.66.0' }));
    await expect.poll(status).toContain('Restart the bridge to use Playwright 1.66.0.');
    expect(status()).toContain('still runs the bundled version (1.65.0)');
  });

  it('announces that a restart is needed to go back to the bundled version', async () => {
    await render(PlaywrightVersionSetting, props({ active: '1.64.0', running: '1.64.0' }));
    await expect
      .poll(status)
      .toContain('Restart the bridge to use the bundled Playwright version.');
    expect(status()).toContain('still runs version 1.64.0');
  });

  it('is read-only when a flag or variable sets the version', async () => {
    await render(PlaywrightVersionSetting, props({ overriddenBy: '--playwright-version' }));
    await expect.element(page.getByText('--playwright-version')).toBeInTheDocument();
    await expect.element(field()).toBeDisabled();
    expect(page.getByRole('button', { name: 'Save' }).elements()).toHaveLength(0);
  });

  it('has no axe violations, also with a restart pending and an error', async () => {
    const { container } = await render(PlaywrightVersionSetting, props({ saved: '1.66.0' }));
    await field().fill('x');
    await page.getByRole('button', { name: 'Save' }).click();
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
