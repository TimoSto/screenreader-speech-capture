import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SessionDto } from '@screenreader-speech-capture/shared';
import SessionsPane from './SessionsPane.svelte';

const session = (patch: Partial<SessionDto>): SessionDto => ({
  id: 1,
  name: 'session',
  run: null,
  client: null,
  startedAt: '2026-11-12T09:00:00.000Z',
  endedAt: '2026-11-12T09:00:07.000Z',
  startSeq: 0,
  firstSeq: null,
  lastSeq: null,
  entries: 6,
  ...patch,
});

const live = session({
  id: 7,
  name: 'agent: audit checkout form',
  run: 'agent-2026-11-12',
  endedAt: null,
  entries: 4,
});
const ended = session({ id: 6, name: 'manual: explore header', entries: 12 });
const now = Date.parse('2026-11-12T09:00:04.000Z');

const props = (patch: Record<string, unknown> = {}) => ({
  sessions: [live, ended],
  currentId: 7,
  selectedId: 7,
  now,
  onSelect: () => {},
  onStart: () => Promise.resolve(),
  onEnd: () => Promise.resolve(),
  ...patch,
});

describe('SessionsPane', () => {
  it('shows the heading, the add button and one row per session', async () => {
    await render(SessionsPane, props());
    await expect.element(page.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
    await expect.element(page.getByTitle('Start a session')).toBeVisible();
    const list = page.getByRole('list', { name: 'Sessions' });
    expect(list.getByRole('listitem').elements()).toHaveLength(2);
  });

  it('speaks the facts of a row and marks the selected one', async () => {
    await render(SessionsPane, props());
    const row = page.getByRole('button', {
      name: 'agent: audit checkout form Session 7, live, run agent-2026-11-12, 4 s, 4 entries',
    });
    await expect.element(row).toHaveAttribute('aria-current', 'true');
    await expect
      .element(page.getByRole('button', { name: /manual: explore header/ }))
      .not.toHaveAttribute('aria-current');
  });

  it('keeps the session rows fully rounded (28px), unlike the 8px default of a list item', async () => {
    await render(SessionsPane, props());
    for (const row of document.querySelectorAll('ul > li')) {
      expect(getComputedStyle(row).borderRadius).toBe('28px');
    }
  });

  it('labels the entry count in the visible meta line', async () => {
    await render(SessionsPane, props());
    const meta = [...document.querySelectorAll('.meta')].map((el) => el.textContent);
    expect(meta[0]).toContain('4 entries');
    expect(meta[1]).toContain('12 entries');
  });

  it('puts the stop button only on the live session, beside its select button', async () => {
    await render(SessionsPane, props());
    expect(page.getByTitle('End session 7').elements()).toHaveLength(1);
    expect(page.getByTitle('End session 6').elements()).toHaveLength(0);
    // no interactive element inside another one
    expect(document.querySelectorAll('button button, button md-icon-button')).toHaveLength(0);
  });

  it('puts one ripple under every row, before the buttons, so it covers the stop button too', async () => {
    await render(SessionsPane, props());
    const rows = document.querySelectorAll('ul > li');
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.firstElementChild?.localName).toBe('md-ripple');
  });

  it('fills the height it is given and scrolls the list, not the heading', async () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      session({ id: 20 - index, name: `session ${20 - index}` }),
    );
    const screen = await render(SessionsPane, props({ sessions: many, currentId: null }), {
      baseElement: document.body,
    });
    const container = screen.container;
    container.style.height = '400px';
    const pane = container.querySelector('section')!;
    const list = container.querySelector('ul')!;
    expect(pane.getBoundingClientRect().height).toBe(400);
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    const heading = container.querySelector('h2')!.getBoundingClientRect();
    expect(heading.bottom).toBeLessThan(list.getBoundingClientRect().top);
    expect(pane.getBoundingClientRect().bottom).toBeLessThanOrEqual(
      container.getBoundingClientRect().bottom,
    );
  });

  it('selects the clicked session', async () => {
    const onSelect = vi.fn();
    await render(SessionsPane, props({ onSelect }));
    await page.getByRole('button', { name: /manual: explore header/ }).click();
    expect(onSelect).toHaveBeenCalledWith(6);
  });

  it('shows the empty state', async () => {
    await render(SessionsPane, props({ sessions: [], currentId: null, selectedId: null }));
    await expect
      .element(page.getByText('No sessions in the buffer. Start one with +.'))
      .toBeVisible();
  });

  it('starts a session from the dialog with a trimmed name and no empty run', async () => {
    const onStart = vi.fn(() => Promise.resolve());
    await render(SessionsPane, props({ onStart }));
    await page.getByTitle('Start a session').click();
    await page.getByLabelText('Name').fill('  checkout test  ');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith('checkout test', null));
  });

  it('asks for a name instead of starting without one', async () => {
    const onStart = vi.fn(() => Promise.resolve());
    await render(SessionsPane, props({ onStart }));
    await page.getByTitle('Start a session').click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect.element(page.getByText('Enter a name.')).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shows the bridge message when starting fails', async () => {
    const onStart = vi.fn(() => Promise.reject(new Error('The bridge is not reachable')));
    await render(SessionsPane, props({ onStart }));
    await page.getByTitle('Start a session').click();
    await page.getByLabelText('Name').fill('x');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect.element(page.getByRole('alert')).toHaveTextContent('The bridge is not reachable');
  });

  it('asks before ending the live session', async () => {
    const onEnd = vi.fn(() => Promise.resolve());
    await render(SessionsPane, props({ onEnd }));
    await page.getByTitle('End session 7').click();
    await expect.element(page.getByText('End session #7?')).toBeVisible();
    expect(onEnd).not.toHaveBeenCalled();
    await page.getByRole('button', { name: 'End session', exact: true }).click();
    await vi.waitFor(() => expect(onEnd).toHaveBeenCalledTimes(1));
  });

  it('has no accessibility violations', async () => {
    const screen = await render(SessionsPane, props());
    // An icon button's ligature text ("add") is a glyph, not a visible label, so the
    // label-in-name rule would flag every icon button for the wrong reason.
    const results = await axe.run(screen.container, {
      rules: { 'label-content-name-mismatch': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
