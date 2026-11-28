import type { Clipboard } from '#lib/core/instructions.js';

/**
 * The browser's clipboard. `navigator.clipboard` only exists in a secure context, and the bridge
 * speaks plain HTTP: opened from another machine, the old selection command has to do it.
 */
export class BrowserClipboard implements Clipboard {
  async copy(text: string): Promise<boolean> {
    const modern = (navigator as Partial<Navigator>).clipboard;
    if (modern !== undefined) {
      try {
        await modern.writeText(text);
        return true;
      } catch {
        // refused (no permission, no focus): try the selection
      }
    }
    return copySelected(text);
  }
}

/** Copies through a text area that exists only for this, then gives the focus back. */
function copySelected(text: string): boolean {
  const focused = document.activeElement;
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.setAttribute('aria-hidden', 'true');
  Object.assign(area.style, { position: 'fixed', top: '0', left: '0', opacity: '0' });
  document.body.append(area);
  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    if (focused instanceof HTMLElement) focused.focus({ preventScroll: true });
  }
}
