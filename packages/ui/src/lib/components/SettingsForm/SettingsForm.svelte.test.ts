import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import { SettingRejected } from '#lib/core/config.js';
import {
  BUFFER_SIZE,
  MCP_ENABLED,
  PLAYWRIGHT_ENABLED,
  PLAYWRIGHT_VERSION,
  TCP_PORT,
  TEXT_ENCODING,
} from '#lib/core/settings.js';
import { configWith } from '../../../test/config.js';
import SettingsForm from './SettingsForm.svelte';

const form = <T extends object>(patch: T) => ({
  name: 'speech capture',
  overrides: {},
  settingContext: { runningPlaywright: '1.65.0' },
  onSave: () => Promise.resolve(),
  ...patch,
});

const save = () => page.getByRole('button', { name: 'Save speech capture settings' });
const revertButton = () => page.getByRole('button', { name: 'Revert speech capture settings' });
/** The focused element as the document sees it: the Material host, not what is in its shadow. */
const focused = () => document.activeElement?.localName;

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

  it('shows the saved port, with nothing to save and nothing pending', async () => {
    await render(SettingsForm, props());
    await expect.element(field()).toHaveValue('4449');
    expect(page.getByText(/Restart pending/).elements()).toHaveLength(0);
    await expect.element(page.getByRole('status')).toHaveTextContent('');
    await expect.element(save()).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not save while nothing changed', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await save().click({ force: true });
    await field().click();
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('says once that it saved, keeps the focus on Save and drops the message on an edit', async () => {
    const screen = await render(
      SettingsForm,
      props({
        onSave: async () => {
          await screen.rerender({ saved: configWith({ tcp: { port: 4450 } }) });
        },
      }),
    );
    await field().fill('4450');
    await save().click();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Saved. Restart the bridge to apply.');
    expect(focused()).toBe('md-filled-button');
    await field().fill('4451');
    await expect.element(page.getByRole('status')).toHaveTextContent('');
  });

  it('takes the message away once the restart has applied the change', async () => {
    const saved = configWith({ tcp: { port: 4450 } });
    const screen = await render(
      SettingsForm,
      props({ onSave: async () => await screen.rerender({ saved }) }),
    );
    await field().fill('4450');
    await save().click();
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Saved. Restart the bridge to apply.');
    await screen.rerender({ active: saved });
    await expect.poll(() => page.getByRole('status').element().textContent).toBe('');
  });

  it('says only "Saved." when nothing waits for a restart', async () => {
    await render(SettingsForm, props());
    await field().fill('4450');
    await save().click();
    await expect.poll(() => page.getByRole('status').element().textContent).toBe('Saved.');
  });

  it('saves a changed port and reports it as a number', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('4450');
    await save().click();
    expect(onSave).toHaveBeenCalledWith({ tcp: { port: 4450 } });
  });

  it('refuses a port that is not 1 to 65535 without asking the bridge', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('70000');
    await save().click();
    await expect
      .element(page.getByText('Enter a port from 1 to 65535.').first())
      .toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows the bridge message when saving fails and keeps what was typed', async () => {
    const onSave = vi.fn(() => Promise.reject(new Error('tcp.port: the port is already in use')));
    await render(SettingsForm, props({ onSave }));
    await field().fill('80');
    await save().click();
    await expect
      .poll(() => page.getByRole('alert').element().textContent)
      .toContain('already in use');
    await expect.element(field()).toHaveValue('80');
  });

  it('puts the typed value back on Revert', async () => {
    await render(SettingsForm, props());
    await field().fill('5000');
    await revertButton().click();
    await expect.element(field()).toHaveValue('4449');
  });

  it('saves with the Enter key', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('4450');
    await userEvent.keyboard('{Enter}');
    expect(onSave).toHaveBeenCalledWith({ tcp: { port: 4450 } });
  });

  it('marks a pending port in the text under the field, with the one in use', async () => {
    await render(SettingsForm, props({ saved: 4450 }));
    await expect.element(field()).toHaveValue('4450');
    await expect
      .element(page.getByText(/^Restart pending, in use: 4449\. The port/).first())
      .toBeInTheDocument();
  });

  it('puts the focus in the field it refused', async () => {
    await render(SettingsForm, props());
    await field().fill('x');
    await save().click();
    await expect.poll(focused).toBe('md-outlined-text-field');
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
    expect(page.getByText(/Restart pending/).elements()).toHaveLength(0);
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
    await save().click();
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

  it('is empty for the bundled version and names it under the field', async () => {
    await render(SettingsForm, props());
    await expect.element(field()).toHaveValue('');
    await expect
      .element(page.getByText(/bundled version \(1\.65\.0\)\./).first())
      .toBeInTheDocument();
    await expect.element(save()).toHaveAttribute('aria-disabled', 'true');
  });

  it('leaves the number out while the status is unknown', async () => {
    await render(SettingsForm, props({ running: null }));
    await expect.element(page.getByText(/for the bundled version\.$/).first()).toBeInTheDocument();
  });

  it('shows the configured version', async () => {
    await render(SettingsForm, props({ active: '1.64.0' }));
    await expect.element(field()).toHaveValue('1.64.0');
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
    await save().click();
    expect(onSave).toHaveBeenCalledWith({ playwright: { version: null } });
  });

  it('refuses a version range without asking the bridge', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await field().fill('^1.65.0');
    await save().click();
    await expect.element(page.getByText(refusal).first()).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('marks a pending version with the one in use', async () => {
    await render(SettingsForm, props({ saved: '1.66.0' }));
    await expect
      .element(page.getByText(/^Restart pending, in use: bundled version \(1\.65\.0\)\./).first())
      .toBeInTheDocument();
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
    await save().click();
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('SettingsForm with the port and the encoding', () => {
  const props = ({
    encoding = 'windows-1252',
    ...patch
  }: Record<string, unknown> & { encoding?: string } = {}) =>
    form({
      settings: [TCP_PORT, TEXT_ENCODING],
      active: configWith({ tcp: { encoding } }),
      saved: configWith({ tcp: { encoding } }),
      ...patch,
    });

  const select = () => page.getByRole('combobox', { name: 'Text encoding' });
  const choose = async (name: string) => {
    await select().click();
    await page.getByRole('option', { name }).click();
  };
  const shownEncoding = () => document.querySelector('md-outlined-select')!.value;

  it('shows the saved encoding', async () => {
    await render(SettingsForm, props({ encoding: 'windows-1250' }));
    await expect.poll(shownEncoding).toBe('windows-1250');
  });

  it('keeps a saved label that is not in the list', async () => {
    await render(SettingsForm, props({ encoding: 'cp1252' }));
    await expect.poll(shownEncoding).toBe('cp1252');
    await expect.element(save()).toHaveAttribute('aria-disabled', 'true');
  });

  it('saves a chosen encoding, and only what changed', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await choose('windows-1251 (Cyrillic)');
    await save().click();
    expect(onSave).toHaveBeenCalledWith({ tcp: { encoding: 'windows-1251' } });
  });

  it('saves the port and the encoding together', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await page.getByRole('textbox', { name: 'TCP port' }).fill('4450');
    await choose('utf-8 (Unicode)');
    await save().click();
    expect(onSave).toHaveBeenCalledWith({ tcp: { port: 4450, encoding: 'utf-8' } });
  });

  it('can be chosen with the keyboard', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    (document.querySelector('md-outlined-select') as HTMLElement).focus();
    await userEvent.keyboard('{Enter}');
    await expect.element(page.getByRole('option', { name: /1252/ })).toBeVisible();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    await expect.poll(shownEncoding).toBe('windows-1253');
  });

  it('puts the saved encoding back on Revert', async () => {
    await render(SettingsForm, props());
    await choose('windows-1251 (Cyrillic)');
    await revertButton().click();
    await expect.poll(shownEncoding).toBe('windows-1252');
    await expect.element(save()).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows a refusal on the field the bridge message is about', async () => {
    const onSave = () =>
      Promise.reject(
        new SettingRejected(
          'playwright.port: port 3000 is already used by tcp.port',
          'playwright.port',
        ),
      );
    await render(SettingsForm, props({ onSave }));
    await page.getByRole('textbox', { name: 'TCP port' }).fill('3000');
    await save().click();
    await expect
      .element(
        page
          .getByText('playwright.port: port 3000 is already used by TCP port. Nothing was saved.')
          .first(),
      )
      .toBeInTheDocument();
    await expect.poll(focused).toBe('md-outlined-text-field');
  });

  it('has no axe violations, also with the list open', async () => {
    const { container } = await render(SettingsForm, props());
    const violations = async (rules: Record<string, { enabled: boolean }> = {}) =>
      (await axe.run(container, { rules })).violations.map((violation) => violation.id);
    expect(await violations()).toEqual([]);
    await select().click();
    await expect.element(page.getByRole('option', { name: /1251/ })).toBeVisible();
    // The Material options get their role through `ElementInternals`, which axe can't see, so it
    // reports the list's children. The role queries above find them as options.
    expect(await violations({ 'aria-required-children': { enabled: false } })).toEqual([]);
  });
});

describe('SettingsForm with the port and the buffer size', () => {
  const props = (patch: Record<string, unknown> = {}) =>
    form({
      settings: [TCP_PORT, BUFFER_SIZE],
      active: configWith(),
      saved: configWith(),
      ...patch,
    });

  const size = () => page.getByRole('textbox', { name: 'Speech buffer size' });
  const port = () => page.getByRole('textbox', { name: 'TCP port' });

  it('saves a size as a number', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await expect.element(size()).toHaveValue('10000');
    await size().fill('50000');
    await save().click();
    expect(onSave).toHaveBeenCalledWith({ buffer: { maxEntries: 50_000 } });
  });

  it('saves nothing while a field is refused, shows every refusal and focuses the first', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await port().fill('0');
    await size().fill('2000000');
    await save().click();
    for (const message of [
      'Enter a port from 1 to 65535.',
      'Enter a whole number from 1 to 1000000.',
    ]) {
      await expect.element(page.getByText(message).first()).toBeInTheDocument();
    }
    expect(onSave).not.toHaveBeenCalled();
    await expect.poll(() => document.activeElement?.getAttribute('data-setting')).toBe('tcp.port');
  });

  it('has no axe violations', async () => {
    const { container } = await render(SettingsForm, props());
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('SettingsForm with a checkbox', () => {
  const props = (patch: Record<string, unknown> = {}) =>
    form({
      name: 'Playwright and MCP',
      settings: [PLAYWRIGHT_ENABLED, PLAYWRIGHT_VERSION],
      active: configWith(),
      saved: configWith(),
      ...patch,
    });

  const server = () => page.getByRole('checkbox', { name: 'Playwright server' });
  const saveBoth = () => page.getByRole('button', { name: 'Save Playwright and MCP settings' });
  const off = configWith({ playwright: { enabled: false } });

  it('is named, described and shows the saved state', async () => {
    await render(SettingsForm, props());
    await expect.element(server()).toBeChecked();
    await expect
      .element(server())
      .toHaveAccessibleDescription('Tests connect to it to drive a browser on the VM.');
  });

  it('flips with Space without saving', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.focus();
    await userEvent.keyboard(' ');
    await expect.element(server()).not.toBeChecked();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves unchecked as false', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await server().click();
    await saveBoth().click();
    expect(onSave).toHaveBeenCalledWith({ playwright: { enabled: false } });
  });

  it('goes back on Revert', async () => {
    await render(SettingsForm, props());
    await server().click();
    await page.getByRole('button', { name: 'Revert Playwright and MCP settings' }).click();
    await expect.element(server()).toBeChecked();
  });

  it('says in its description that a restart is pending', async () => {
    await render(SettingsForm, props({ saved: off }));
    await expect.element(server()).not.toBeChecked();
    await expect
      .element(server())
      .toHaveAccessibleDescription(
        'Restart pending, in use: On. Tests connect to it to drive a browser on the VM.',
      );
  });

  it('is text when a flag turns the server off', async () => {
    const overrides = { 'playwright.enabled': '--no-playwright' };
    await render(SettingsForm, props({ active: off, saved: off, overrides }));
    expect(page.getByRole('checkbox').elements()).toHaveLength(0);
    await expect.element(page.getByRole('definition').first()).toHaveTextContent('Off');
    await expect.element(page.getByText('--no-playwright')).toBeInTheDocument();
  });

  it('shows a port clash from turning it on for the whole form', async () => {
    const onSave = () =>
      Promise.reject(
        new SettingRejected(
          'playwright.port: port 3000 is already used by tcp.port',
          'playwright.port',
        ),
      );
    await render(SettingsForm, props({ active: off, saved: off, onSave }));
    await server().click();
    await saveBoth().click();
    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(
        'playwright.port: port 3000 is already used by TCP port. Nothing was saved.',
      );
  });

  it.each([true, false])('has no axe violations (checked: %s)', async (enabled) => {
    const config = configWith({ playwright: { enabled } });
    const { container } = await render(SettingsForm, props({ active: config, saved: config }));
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('SettingsForm with the Playwright server and MCP', () => {
  const props = (patch: Record<string, unknown> = {}) =>
    form({
      name: 'Playwright and MCP',
      settings: [PLAYWRIGHT_ENABLED, PLAYWRIGHT_VERSION, MCP_ENABLED],
      active: configWith(),
      saved: configWith(),
      ...patch,
    });

  const mcp = () => page.getByRole('checkbox', { name: 'Playwright MCP' });
  const saveAll = () => page.getByRole('button', { name: 'Save Playwright and MCP settings' });

  it('saves both services and the version in one patch', async () => {
    const onSave = vi.fn(() => Promise.resolve());
    await render(SettingsForm, props({ onSave }));
    await page.getByRole('checkbox', { name: 'Playwright server' }).click();
    await page.getByRole('textbox', { name: 'Playwright version' }).fill('1.64.0');
    await mcp().click();
    await saveAll().click();
    expect(onSave).toHaveBeenCalledWith({
      playwright: { enabled: false, version: '1.64.0' },
      mcp: { enabled: false },
    });
  });

  it('keeps the other settings editable when a flag turns MCP off', async () => {
    const off = configWith({ mcp: { enabled: false } });
    const overrides = { 'mcp.enabled': '--no-mcp' };
    await render(SettingsForm, props({ active: off, saved: off, overrides }));
    await expect.element(page.getByText('--no-mcp')).toBeInTheDocument();
    expect(page.getByRole('checkbox').elements()).toHaveLength(1);
    await expect.element(saveAll()).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = await render(SettingsForm, props());
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
