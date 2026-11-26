import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import LoopbackBanner from './LoopbackBanner.svelte';

describe('LoopbackBanner', () => {
  it('is a note that says the log is aria-hidden because the page is opened locally', async () => {
    await render(LoopbackBanner);
    const note = page.getByRole('note');
    await expect.element(note).toBeVisible();
    const text = note.element().textContent;
    expect(text).toContain('aria-hidden');
    expect(text).toContain('loopback');
  });

  it('is not a live region, and hides its icon from a screen reader', async () => {
    const { container } = await render(LoopbackBanner);
    expect(container.querySelector('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    expect(container.querySelector('md-icon')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('has no axe violations', async () => {
    const { container } = await render(LoopbackBanner);
    const results = await axe.run(container);
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
