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
  outsideEntries: 0,
  selectedId: 7,
  now,
  onSelect: () => {},
  onStart: () => Promise.resolve(),
  onEnd: () => Promise.resolve(),
  ...patch,
});

/** `md-icon-button` moves `aria-expanded` from its host to the real `<button>` in its shadow root. */
const innerExpanded = (title: string): string | null | undefined =>
  document
    .querySelector(`md-icon-button[title="${title}"]`)
    ?.shadowRoot?.querySelector('button')
    ?.getAttribute('aria-expanded');

describe('SessionsPane collapsing', () => {
  it('has no collapse button without a handler', async () => {
    await render(SessionsPane, props());
    expect(page.getByTitle('Collapse sessions').elements()).toHaveLength(0);
  });

  it('asks to collapse, and says it is expanded', async () => {
    const onToggleCollapse = vi.fn();
    await render(SessionsPane, props({ onToggleCollapse }));
    const button = page.getByTitle('Collapse sessions');
    await expect.poll(() => innerExpanded('Collapse sessions')).toBe('true');
    await button.click();
    expect(onToggleCollapse).toHaveBeenCalledOnce();
  });

  it('keeps only the buttons while collapsed', async () => {
    await render(SessionsPane, props({ collapsed: true, onToggleCollapse: () => {} }));
    await expect.poll(() => innerExpanded('Expand sessions')).toBe('false');
    await expect.element(page.getByTitle('End session 7')).toBeVisible();
    expect(document.querySelector('ul')).toBeNull();
    expect(document.querySelector('section[aria-labelledby]')).not.toBeNull();
  });

  it('keeps the collapse button where it is when the pane collapses', async () => {
    const rect = () =>
      document.querySelector('md-icon-button.collapse')?.getBoundingClientRect() ?? null;
    const screen = await render(SessionsPane, props({ onToggleCollapse: () => {} }));
    const expanded = rect();
    await screen.rerender({ collapsed: true });
    const collapsed = rect();
    expect(expanded).not.toBeNull();
    expect([collapsed?.left, collapsed?.top]).toEqual([expanded?.left, expanded?.top]);
  });

  it('has no axe violations while collapsed', async () => {
    const { container } = await render(
      SessionsPane,
      props({ collapsed: true, onToggleCollapse: () => {} }),
    );
    // An icon button's ligature text is a glyph, not a visible label (see the axe test below).
    const results = await axe.run(container, {
      rules: { 'label-content-name-mismatch': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});

describe('SessionsPane', () => {
  it('shows the heading, the start/stop button and one row per session', async () => {
    await render(SessionsPane, props());
    await expect.element(page.getByRole('heading', { name: 'Sessions' })).toBeInTheDocument();
    await expect.element(page.getByTitle('End session 7')).toBeVisible();
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

  it('toggles the header button between play and stop with the live session', async () => {
    await render(SessionsPane, props({ currentId: null }));
    expect(page.getByTitle('Start a session').elements()).toHaveLength(1);
    expect(page.getByTitle('End session 7').elements()).toHaveLength(0);
    expect(document.querySelector('header md-icon')?.textContent).toBe('play_arrow');
  });

  it('has no button inside a row besides the select button', async () => {
    await render(SessionsPane, props());
    expect(document.querySelectorAll('ul md-icon-button, button button')).toHaveLength(0);
  });

  it('puts one ripple under every row, before the buttons', async () => {
    await render(SessionsPane, props());
    const rows = document.querySelectorAll('ul:not(.outside) > li');
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
      .element(page.getByText('No sessions in the buffer. Start one with the play button.'))
      .toBeVisible();
  });

  it('starts a session from the dialog with a trimmed name and no empty run', async () => {
    const onStart = vi.fn(() => Promise.resolve());
    await render(SessionsPane, props({ onStart, currentId: null }));
    await page.getByTitle('Start a session').click();
    await page.getByLabelText('Name').fill('  checkout test  ');
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledWith('checkout test', null));
  });

  it('asks for a name instead of starting without one', async () => {
    const onStart = vi.fn(() => Promise.resolve());
    await render(SessionsPane, props({ onStart, currentId: null }));
    await page.getByTitle('Start a session').click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect.element(page.getByText('Enter a name.')).toBeVisible();
    expect(onStart).not.toHaveBeenCalled();
  });

  it('shows the bridge message when starting fails', async () => {
    const onStart = vi.fn(() => Promise.reject(new Error('The bridge is not reachable')));
    await render(SessionsPane, props({ onStart, currentId: null }));
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

  it('says an empty live session is dropped when it ends', async () => {
    await render(SessionsPane, props({ sessions: [{ ...live, entries: 0 }, ended] }));
    await page.getByTitle('End session 7').click();
    await expect.element(page.getByText('Drop session #7?')).toBeVisible();
    await expect.element(page.getByText(/has no entries, so ending it deletes it/)).toBeVisible();
  });

  it('pins an "Outside sessions" row with its entry count below the list', async () => {
    const onSelect = vi.fn();
    await render(SessionsPane, props({ outsideEntries: 12, onSelect }));
    const row = page.getByRole('button', {
      name: 'Outside sessions Speech captured while no session was running, 12 entries',
    });
    await expect.element(row).not.toHaveAttribute('aria-current');
    await row.click();
    expect(onSelect).toHaveBeenCalledWith('none');
  });

  it('keeps the outside row visible while empty, selected only when it is the scope', async () => {
    const screen = await render(SessionsPane, props());
    const row = page.getByRole('button', {
      name: 'Outside sessions Speech captured while no session was running, 0 entries',
    });
    await expect.element(row).not.toHaveAttribute('aria-current');
    await screen.rerender(props({ sessions: [], currentId: null, selectedId: 'none' }));
    await expect.element(row).toHaveAttribute('aria-current', 'true');
  });

  it('hides the outside row while collapsed', async () => {
    await render(SessionsPane, props({ collapsed: true, outsideEntries: 3 }));
    expect(page.getByRole('button', { name: /Outside sessions/ }).elements()).toHaveLength(0);
  });

  it('has no accessibility violations', async () => {
    const screen = await render(SessionsPane, props());
    // An icon button's ligature text ("play_arrow") is a glyph, not a visible label, so the
    // label-in-name rule would flag every icon button for the wrong reason.
    const results = await axe.run(screen.container, {
      rules: { 'label-content-name-mismatch': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
