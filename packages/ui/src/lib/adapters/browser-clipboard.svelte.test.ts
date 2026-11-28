import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserClipboard } from './browser-clipboard.js';

/** What a page over plain HTTP from another machine has: no `navigator.clipboard`. */
function insecureContext(): void {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
}

describe('BrowserClipboard', () => {
  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).clipboard;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it("writes to the browser's clipboard", async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const command = vi.spyOn(document, 'execCommand');
    await expect(new BrowserClipboard().copy('npm i')).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith('npm i');
    expect(command).not.toHaveBeenCalled();
  });

  it('copies a selection without it, and gives the focus back', async () => {
    insecureContext();
    const button = document.body.appendChild(document.createElement('button'));
    button.focus();
    let selected = '';
    vi.spyOn(document, 'execCommand').mockImplementation(() => {
      const area = document.querySelector('textarea')!;
      selected = area.value.slice(area.selectionStart, area.selectionEnd);
      return true;
    });
    await expect(new BrowserClipboard().copy('one\ntwo')).resolves.toBe(true);
    expect(selected).toBe('one\ntwo');
    expect(document.querySelector('textarea')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('copies a selection when the clipboard refuses', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    vi.spyOn(document, 'execCommand').mockReturnValue(true);
    await expect(new BrowserClipboard().copy('x')).resolves.toBe(true);
  });

  it('says so when neither works', async () => {
    insecureContext();
    vi.spyOn(document, 'execCommand').mockReturnValue(false);
    await expect(new BrowserClipboard().copy('x')).resolves.toBe(false);
    expect(document.querySelector('textarea')).toBeNull();
  });
});
