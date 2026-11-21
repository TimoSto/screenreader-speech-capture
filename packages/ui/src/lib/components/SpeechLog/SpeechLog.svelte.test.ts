import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';
import SpeechLog from './SpeechLog.svelte';

const entry = (seq: number, patch: Partial<SpeechEntryDto> = {}): SpeechEntryDto => ({
  seq,
  kind: 'speech',
  text: `spoken ${seq}`,
  receivedAt: '2026-11-12T09:00:00.000Z',
  source: 'tcp',
  voice: null,
  connectionId: null,
  sessionId: 3,
  ...patch,
});

const props = (patch: Record<string, unknown> = {}) => ({
  heading: '#3 Checkout flow',
  entries: [entry(1), entry(2, { kind: 'marker', text: 'step 3', source: 'api' }), entry(3)],
  connection: 'live' as const,
  ...patch,
});

describe('SpeechLog', () => {
  it('shows the heading and one row per entry with received, text and seq', async () => {
    await render(SpeechLog, props());
    await expect
      .element(page.getByRole('heading', { name: '#3 Checkout flow' }))
      .toBeInTheDocument();
    const table = page.getByRole('table', { name: 'Speech' });
    expect(table.getByRole('row').elements()).toHaveLength(4); // header + 3
    await expect.element(table.getByText('spoken 3')).toBeVisible();
    await expect.element(table.getByText('#3', { exact: true })).toBeVisible();
    await expect.element(table.getByText('step 3')).toBeVisible();
  });

  it('has no gap column', async () => {
    await render(SpeechLog, props());
    const headers = page.getByRole('columnheader').elements();
    expect(headers.map((header) => header.textContent.trim().toLowerCase())).toEqual([
      'received',
      'spoken text',
      'seq',
    ]);
  });

  it('shows an empty state without entries', async () => {
    await render(SpeechLog, props({ entries: [] }));
    await expect.element(page.getByText('No speech yet')).toBeVisible();
    expect(document.querySelector('table')).toBeNull();
  });

  it('has no toolbar yet', async () => {
    await render(SpeechLog, props());
    expect(document.querySelector('[role="toolbar"]')).toBeNull();
  });

  it('says so while the stream reconnects', async () => {
    await render(SpeechLog, props({ connection: 'reconnecting' }));
    await expect.element(page.getByRole('status')).toHaveTextContent('reconnecting');
  });

  it('says so when the speech could not be loaded', async () => {
    await render(SpeechLog, props({ entries: [], connection: 'failed' }));
    await expect.element(page.getByRole('alert')).toHaveTextContent('could not be loaded');
  });

  it('explains an ended session without entries', async () => {
    await render(SpeechLog, props({ entries: [], connection: 'ended' }));
    await expect.element(page.getByText('No entries left')).toBeVisible();
  });

  it('has no axe violations', async () => {
    const { container } = await render(SpeechLog, props());
    const results = await axe.run(container, {
      rules: { 'label-content-name-mismatch': { enabled: false } },
    });
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
