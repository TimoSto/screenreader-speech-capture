import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import { THEMES } from '#lib/core/theme.js';
import '#lib/styles/tokens.css';
import '#lib/styles/global.css';
import { statusWith } from '../../../test/status.js';
import TestMachineInstructions from './TestMachineInstructions.svelte';

const { playwright, mcp } = statusWith();

const props = (
  patch: Partial<ComponentProps<typeof TestMachineInstructions>> = {},
): ComponentProps<typeof TestMachineInstructions> => ({
  address: { url: 'http://win-vm:5151', placeholder: false },
  local: false,
  loopbackOnly: false,
  httpPort: 5151,
  playwright,
  mcp,
  version: '0.9.0',
  onCopy: vi.fn(() => Promise.resolve(true)),
  ...patch,
});

const copy = (what: string) => page.getByRole('button', { name: `Copy ${what}` });

describe('TestMachineInstructions', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('fills in the address and the Playwright version', async () => {
    const onCopy = vi.fn<(text: string) => Promise<boolean>>(() => Promise.resolve(true));
    await render(TestMachineInstructions, props({ onCopy }));
    await copy('the client commands').click();
    await copy('the test packages command').click();
    await copy('the MCP configuration').click();
    const copied = onCopy.mock.calls.map(([text]) => text);
    expect(copied[0]).toContain('config set url http://win-vm:5151');
    expect(copied[1]).toContain('@playwright/test@1.65.0');
    expect(copied[2]).toContain('"http://win-vm:5151/playwright-mcp"');
  });

  it('needs no firewall rule from another machine', async () => {
    await render(TestMachineInstructions, props());
    expect(copy('the firewall command').elements()).toHaveLength(0);
    await expect.element(page.getByText(/already reaches the bridge/)).toBeVisible();
    expect(page.getByText(/Replace/).elements()).toHaveLength(0);
  });

  it("opens the firewall on the bridge's machine and says to fill in the address", async () => {
    const given = props({
      local: true,
      httpPort: 6000,
      address: { url: 'http://<vm-ip>:6000', placeholder: true },
    });
    await render(TestMachineInstructions, given);
    await copy('the firewall command').click();
    expect(given.onCopy).toHaveBeenCalledWith(expect.stringContaining('-LocalPort 6000'));
    await expect.element(page.getByText(/Replace/)).toBeVisible();
  });

  it('warns when other machines cannot connect', async () => {
    await render(TestMachineInstructions, props({ loopbackOnly: true }));
    await expect.element(page.getByText(/other machines can't connect/)).toBeVisible();
  });

  it('points to the settings for a service that is off', async () => {
    const stopped = { ...playwright, state: 'stopped' as const };
    await render(TestMachineInstructions, props({ playwright: stopped, mcp: stopped }));
    expect(copy('the test packages command').elements()).toHaveLength(0);
    expect(copy('the MCP configuration').elements()).toHaveLength(0);
    expect(page.getByRole('link', { name: 'Turn it on in Settings.' }).elements()).toHaveLength(2);
  });

  it('leaves out the version while the status is unknown', async () => {
    await render(TestMachineInstructions, props({ playwright: null, mcp: null }));
    expect(copy('the test packages command').elements()).toHaveLength(0);
    await expect.element(copy('the MCP configuration')).toBeInTheDocument();
  });

  it.each(THEMES.map(({ value }) => value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      const { container } = await render(
        TestMachineInstructions,
        props({ local: true, loopbackOnly: true }),
      );
      const results = await axe.run(container, {
        rules: { 'label-content-name-mismatch': { enabled: false } },
      });
      expect(results.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
