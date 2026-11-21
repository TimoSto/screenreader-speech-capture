import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import TcpPortSetting from './TcpPortSetting.svelte';

const props = (patch: Record<string, unknown> = {}) => ({
  active: 4449,
  saved: 4449,
  overriddenBy: null,
  onSave: () => Promise.resolve(),
  ...patch,
});

/** The real `<input>` is inside the text field's shadow root. */
const field = () => page.getByRole('textbox', { name: 'TCP port' });

describe('TcpPortSetting', () => {
  it('shows the saved port, the one in use and no restart notice', async () => {
    await render(TcpPortSetting, props());
    await expect.element(field()).toHaveValue('4449');
    await expect.element(page.getByText('In use: 4449')).toBeInTheDocument();
    expect(page.getByText(/Restart the bridge/).elements()).toHaveLength(0);
    await expect.element(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a changed port and reports it as a number', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(TcpPortSetting, props({ onSave }));
    await field().fill('4450');
    await page.getByRole('button', { name: 'Save' }).click();
    expect(onSave).toHaveBeenCalledWith(4450);
  });

  it('refuses a port that is not 1 to 65535 without asking the bridge', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(TcpPortSetting, props({ onSave }));
    await field().fill('70000');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect
      .element(page.getByText('Enter a port from 1 to 65535.').first())
      .toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the bridge message when saving fails and keeps what was typed', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('tcp.port: the port is already in use')));
    await render(TcpPortSetting, props({ onSave }));
    await field().fill('80');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect
      .poll(() => page.getByRole('alert').element().textContent)
      .toContain('already in use');
    await expect.element(field()).toHaveValue('80');
  });

  it('puts the typed value back on Revert', async () => {
    await render(TcpPortSetting, props());
    await field().fill('5000');
    await page.getByRole('button', { name: 'Revert' }).click();
    await expect.element(field()).toHaveValue('4449');
  });

  it('saves with the Enter key', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(TcpPortSetting, props({ onSave }));
    await field().fill('4450');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith(4450);
  });

  it('announces that a restart is needed, and what to do on the VM', async () => {
    await render(TcpPortSetting, props({ saved: 4450 }));
    const status = () => page.getByRole('status').element().textContent;
    await expect.poll(status).toContain('Restart the bridge to use port 4450.');
    expect(status()).toContain('still listens on 4449');
    expect(status()).toContain('text-to-socket-engine-add-voice');
    await expect.element(field()).toHaveValue('4450');
  });

  it('is read-only when a flag or variable sets the port', async () => {
    await render(TcpPortSetting, props({ overriddenBy: '--tcp-port' }));
    await expect.element(page.getByText('--tcp-port')).toBeInTheDocument();
    await expect.element(field()).toBeDisabled();
    expect(page.getByRole('button', { name: 'Save' }).elements()).toHaveLength(0);
  });

  it('has no axe violations, also with a restart pending and an error', async () => {
    const { container } = await render(TcpPortSetting, props({ saved: 4450 }));
    await field().fill('x');
    await page.getByRole('button', { name: 'Save' }).click();
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
