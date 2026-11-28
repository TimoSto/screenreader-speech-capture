import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { PLAYWRIGHT_VERSION, TCP_PORT } from '#lib/core/settings.js';
import { configWith } from '../../../test/config.js';
import SettingsForm from './SettingsForm.svelte';

const form = <T extends object>(patch: T) => ({
  overrides: {},
  settingContext: { runningPlaywright: '1.65.0' },
  onSave: () => Promise.resolve(),
  ...patch,
});

const status = () => page.getByRole('status').element().textContent.replace(/\s+/g, ' ');

describe('SettingsForm with the TCP port', () => {
  const props = ({
    active = 4449,
    saved = active,
    ...patch
  }: Record<string, unknown> & { active?: number; saved?: number } = {}) =>
    form({
      settings: [TCP_PORT],
      active: configWith({ tcp: { port: active } }),
      saved: configWith({ tcp: { port: saved } }),
      ...patch,
    });

  /** The real `<input>` is inside the text field's shadow root. */
  const field = () => page.getByRole('textbox', { name: 'TCP port' });

  it('shows the saved port, the one in use and no restart notice', async () => {
    await render(SettingsForm, props());
    await expect.element(field()).toHaveValue('4449');
    await expect.element(page.getByText('In use: 4449')).toBeInTheDocument();
    expect(page.getByText(/Restart the bridge/).elements()).toHaveLength(0);
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a changed port and reports it as a number', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('4450');
    await page.getByRole('button', { name: 'Save' }).click();
    expect(onSave).toHaveBeenCalledWith({ tcp: { port: 4450 } });
  });

  it('refuses a port that is not 1 to 65535 without asking the bridge', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('70000');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect
      .element(page.getByText('Enter a port from 1 to 65535.').first())
      .toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the bridge message when saving fails and keeps what was typed', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('tcp.port: the port is already in use')));
    await render(SettingsForm, props({ onSave }));
    await field().fill('80');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() => page.getByRole('alert').element().textContent)
      .toContain('already in use');
    await expect.element(field()).toHaveValue('80');
  });

  it('puts the typed value back on Revert', async () => {
    await render(SettingsForm, props());
    await field().fill('5000');
    await page.getByRole('button', { name: 'Revert' }).click();
    await expect.element(field()).toHaveValue('4449');
  });

  it('saves with the Enter key', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('4450');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith({ tcp: { port: 4450 } });
  });

  it('announces that a restart is needed, and what to do on the VM', async () => {
    await render(SettingsForm, props({ saved: 4450 }));
    await expect.poll(status).toContain('Restart the bridge to use port 4450.');
    expect(status()).toContain('still listens on 4449');
    expect(status()).toContain('(text-to-socket-engine-add-voice)');
    await expect.element(field()).toHaveValue('4450');
  });

  it('shows a port a flag sets as text, with what sets it', async () => {
    await render(SettingsForm, props({ overrides: { 'tcp.port': '--tcp-port' } }));
    await expect.element(page.getByRole('definition').first()).toHaveTextContent('4449');
    await expect.element(page.getByText('--tcp-port')).toBeInTheDocument();
    expect(page.getByRole('textbox').elements()).toHaveLength(0);
    expect(page.getByRole('button').elements()).toHaveLength(0);
  });

  it('shows the port in use, without a restart notice, when another was saved', async () => {
    await render(SettingsForm, props({ saved: 4450, overrides: { 'tcp.port': '--tcp-port' } }));
    await expect.element(page.getByRole('definition').first()).toHaveTextContent('4449');
    expect(page.getByText(/4450/).elements()).toHaveLength(0);
    expect(page.getByText(/Restart the bridge/).elements()).toHaveLength(0);
  });

  it('has no axe violations when a flag sets the port', async () => {
    const overrides = { 'tcp.port': '--tcp-port' };
    const { container } = await render(SettingsForm, props({ overrides }));
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });

  it('has no axe violations, also with a restart pending and an error', async () => {
    const { container } = await render(SettingsForm, props({ saved: 4450 }));
    await field().fill('x');
    await page.getByRole('button', { name: 'Save' }).click();
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('SettingsForm with the Playwright version', () => {
  const props = ({
    active = null,
    saved = active,
    running = '1.65.0',
    ...patch
  }: Record<string, unknown> & {
    active?: string | null;
    saved?: string | null;
    running?: string | null;
  } = {}) =>
    form({
      settings: [PLAYWRIGHT_VERSION],
      active: configWith({ playwright: { version: active } }),
      saved: configWith({ playwright: { version: saved } }),
      settingContext: { runningPlaywright: running },
      ...patch,
    });

  const field = () => page.getByRole('textbox', { name: 'Playwright version' });
  const refusal = 'Enter an exact version like 1.65.0, or leave the field empty.';

  it('is empty for the bundled version and names the one that runs', async () => {
    await render(SettingsForm, props());
    await expect.element(field()).toHaveValue('');
    await expect.element(page.getByText('In use: bundled version (1.65.0)')).toBeInTheDocument();
    expect(page.getByText(/Restart the bridge/).elements()).toHaveLength(0);
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('leaves the number out while the status is unknown', async () => {
    await render(SettingsForm, props({ running: null }));
    await expect.element(page.getByText('In use: bundled version')).toBeInTheDocument();
  });

  it('shows the configured version', async () => {
    await render(SettingsForm, props({ active: '1.64.0' }));
    await expect.element(field()).toHaveValue('1.64.0');
    await expect.element(page.getByText('In use: 1.64.0')).toBeInTheDocument();
  });

  it('saves a typed version', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill(' 1.66.0 ');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith({ playwright: { version: '1.66.0' } });
  });

  it('saves the bundled version when the field is emptied', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ active: '1.64.0', onSave }));
    await field().fill('');
    await page.getByRole('button', { name: 'Save' }).click();
    expect(onSave).toHaveBeenCalledWith({ playwright: { version: null } });
  });

  it('refuses a version range without asking the bridge', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('^1.65.0');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect.element(page.getByText(refusal).first()).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('announces that a restart is needed for a new version', async () => {
    await render(SettingsForm, props({ saved: '1.66.0' }));
    await expect.poll(status).toContain('Restart the bridge to use Playwright 1.66.0.');
    expect(status()).toContain('still runs the bundled version (1.65.0)');
  });

  it('announces that a restart is needed to go back to the bundled version', async () => {
    await render(SettingsForm, props({ active: '1.64.0', saved: null, running: '1.64.0' }));
    await expect
      .poll(status)
      .toContain('Restart the bridge to use the bundled Playwright version.');
    expect(status()).toContain('still runs version 1.64.0');
  });

  it('shows a version a flag sets as text, with what sets it', async () => {
    const overrides = { 'playwright.version': '--playwright-version' };
    await render(SettingsForm, props({ overrides }));
    await expect
      .element(page.getByRole('definition').first())
      .toHaveTextContent('bundled version (1.65.0)');
    await expect.element(page.getByText('--playwright-version')).toBeInTheDocument();
    expect(page.getByRole('textbox').elements()).toHaveLength(0);
  });

  it('has no axe violations, also with a restart pending and an error', async () => {
    const { container } = await render(SettingsForm, props({ saved: '1.66.0' }));
    await field().fill('x');
    await page.getByRole('button', { name: 'Save' }).click();
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
