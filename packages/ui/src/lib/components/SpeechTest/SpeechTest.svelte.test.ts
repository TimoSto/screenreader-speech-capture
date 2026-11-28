import axe from 'axe-core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { ComponentProps } from 'svelte';
import { render } from 'vitest-browser-svelte';
import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';
import { THEMES } from '#lib/core/theme.js';
import '#lib/styles/tokens.css';
import '#lib/styles/global.css';
import SpeechTest from './SpeechTest.svelte';

const entry: SpeechEntryDto = {
  seq: 7,
  kind: 'speech',
  text: 'Submit, button',
  receivedAt: '2026-11-12T09:00:00.000Z',
  source: 'tcp',
  voice: null,
  connectionId: 1,
  sessionId: null,
};

const props = (
  patch: Partial<ComponentProps<typeof SpeechTest>> = {},
): ComponentProps<typeof SpeechTest> => ({
  phase: 'idle',
  via: 'manual',
  entries: [],
  reconnecting: false,
  failure: '',
  local: false,
  input: { available: true, backend: 'robotjs', reason: null },
  port: 4450,
  version: '0.9.0',
  onListen: vi.fn(),
  onSendKeys: vi.fn(),
  onStop: vi.fn(),
  isSessionRunning: () => Promise.resolve(false),
  ...patch,
});

const button = (name: string) => page.getByRole('button', { name, exact: true });
/** `md-*-button` keeps a soft-disabled button focusable and says so with `aria-disabled`. */
const softDisabled = (label: string): boolean =>
  [...document.querySelectorAll('.actions > *')]
    .find((element) => element.textContent.trim() === label)!
    .hasAttribute('soft-disabled');

describe('SpeechTest', () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it('listens and sends the keys', async () => {
    const given = props();
    await render(SpeechTest, given);
    await button('Listen').click();
    expect(given.onListen).toHaveBeenCalledOnce();
    await button('Send Insert+T').click();
    await vi.waitFor(() => expect(given.onSendKeys).toHaveBeenCalledOnce());
    expect(softDisabled('Stop')).toBe(true);
  });

  it('only stops while it listens', async () => {
    await render(SpeechTest, props({ phase: 'listening' }));
    expect(softDisabled('Listen')).toBe(true);
    expect(softDisabled('Send Insert+T')).toBe(true);
    expect(softDisabled('Stop')).toBe(false);
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Listening. Make the screen reader speak, for example with a key press.');
  });

  it('says why the keys cannot be sent', async () => {
    const input = { available: false, backend: null, reason: 'only on Windows' };
    await render(SpeechTest, props({ input }));
    expect(softDisabled('Send Insert+T')).toBe(true);
    await expect.element(page.getByText("Insert+T can't be sent: only on Windows")).toBeVisible();
  });

  it('asks before it sends keys during a session', async () => {
    const given = props({ isSessionRunning: () => Promise.resolve(true) });
    await render(SpeechTest, given);
    await button('Send Insert+T').click();
    await button('Cancel').click();
    expect(given.onSendKeys).not.toHaveBeenCalled();
    await button('Send Insert+T').click();
    await button('Send').click();
    expect(given.onSendKeys).toHaveBeenCalledOnce();
  });

  it('shows what arrived, and announces only that it did', async () => {
    await render(SpeechTest, props({ phase: 'heard', entries: [entry] }));
    await expect.element(page.getByRole('status')).toHaveTextContent('Speech arrived.');
    expect(page.getByRole('status').element().textContent).not.toContain('Submit');
    await expect
      .element(page.getByRole('list', { name: 'Speech that arrived' }))
      .toHaveTextContent('Submit, button');
    await expect
      .element(page.getByRole('link', { name: 'text encoding' }))
      .toHaveAttribute('href', '/settings');
  });

  it("hides what arrived from the screen reader on the bridge's machine", async () => {
    await render(SpeechTest, props({ phase: 'heard', entries: [entry], local: true }));
    expect(document.querySelector('ol')?.getAttribute('aria-hidden')).toBe('true');
    await expect.element(page.getByText(/can pass the check/)).toBeVisible();
  });

  it("does not announce that it listens on the bridge's machine", async () => {
    await render(SpeechTest, props({ phase: 'listening', local: true }));
    await expect.element(page.getByText(/^Listening\./)).toBeVisible();
    expect(page.getByRole('status').element().textContent).toBe('');
  });

  it('says what to check after silence, with the port in use', async () => {
    await render(SpeechTest, props({ phase: 'silent' }));
    await expect.element(page.getByRole('status')).toHaveTextContent('Nothing arrived.');
    await expect.element(page.getByText(/must send to port 4450/)).toBeVisible();
    expect(page.getByRole('link').elements()).toHaveLength(3);
  });

  it('points at the keys after silence that followed them', async () => {
    await render(SpeechTest, props({ phase: 'silent', via: 'keys' }));
    await expect
      .element(page.getByText("keys don't reach the screen reader", { exact: false }))
      .toBeVisible();
  });

  it('says why it failed', async () => {
    await render(SpeechTest, props({ phase: 'failed', failure: 'only on Windows' }));
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('The check failed: only on Windows');
  });

  it('says that the connection is lost', async () => {
    await render(SpeechTest, props({ phase: 'listening', reconnecting: true }));
    await expect
      .element(page.getByRole('status'))
      .toHaveTextContent('Connection lost, reconnecting…');
  });

  it.each(THEMES.map(({ value }) => value))(
    'has no axe violations in the %s theme',
    async (theme) => {
      document.documentElement.dataset.theme = theme;
      for (const patch of [{ phase: 'heard', entries: [entry] }, { phase: 'silent' }] as const) {
        const { container, unmount } = await render(SpeechTest, props(patch));
        const results = await axe.run(container, {
          rules: { 'label-content-name-mismatch': { enabled: false } },
        });
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
        await unmount();
      }
    },
  );
});
