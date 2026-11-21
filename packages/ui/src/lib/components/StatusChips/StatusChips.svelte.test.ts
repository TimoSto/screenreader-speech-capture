import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Chip } from '#lib/core/status.js';
import StatusChips from './StatusChips.svelte';

const chips: Chip[] = [
  {
    id: 'playwright',
    text: 'Playwright 1.65.0',
    tone: 'ok',
    dot: 'filled',
    description: 'Playwright 1.65.0, running',
  },
  {
    id: 'mcp',
    text: 'MCP 0.0.85',
    tone: 'neutral',
    dot: 'hollow',
    description: 'MCP 0.0.85, stopped',
    down: true,
  },
];

describe('StatusChips', () => {
  it('lists one chip per entry, named by its description', async () => {
    await render(StatusChips, { chips, announcement: '' });
    await expect.element(page.getByRole('list', { name: 'Bridge status' })).toBeInTheDocument();
    await expect.element(page.getByRole('listitem')).toHaveLength(2);
    await expect
      .element(page.getByRole('listitem', { name: 'MCP 0.0.85, stopped' }))
      .toBeInTheDocument();
  });

  it('shows the text and marks only down chips', async () => {
    await render(StatusChips, { chips, announcement: '' });
    await expect
      .element(page.getByRole('listitem', { name: 'Playwright 1.65.0, running' }))
      .toHaveTextContent('Playwright 1.65.0');
    await expect
      .element(page.getByRole('listitem', { name: 'MCP 0.0.85, stopped' }))
      .toHaveClass('down');
    await expect
      .element(page.getByRole('listitem', { name: 'Playwright 1.65.0, running' }))
      .not.toHaveClass('down');
  });

  it('speaks the announcement through a status region, and nothing when it is empty', async () => {
    const screen = await render(StatusChips, { chips, announcement: '' });
    await expect.element(page.getByRole('status')).toHaveTextContent('');
    await screen.rerender({ chips, announcement: 'MCP 0.0.85, failed.' });
    await expect.element(page.getByRole('status')).toHaveTextContent('MCP 0.0.85, failed.');
  });

  it('renders no list without chips', async () => {
    await render(StatusChips, { chips: [], announcement: '' });
    await expect.element(page.getByRole('list')).not.toBeInTheDocument();
  });
});
