import type { FocusablePage, NativeInput } from '../../../application/ports/in/native-input.js';
import {
  contentCornerPoint,
  parseWindowGeometry,
  READ_GEOMETRY_SCRIPT,
} from '../../../domain/native-input.js';

/** A Playwright `Page` as far as {@link focusPage} needs it. */
export interface ReloadablePage extends FocusablePage {
  reload(): Promise<unknown>;
  bringToFront(): Promise<void>;
}

/**
 * Gives the page's browser window OS-level focus (docs/usage/client.md#playwright-fixture): the
 * bridge brings it to the front if it started the browser (`bringToFront`), then
 * `page.bringToFront()` moves the browser's keyboard focus from its toolbar into the page.
 * Otherwise a native click on the top-left corner of the page content, then a reload, so the
 * click leaves no trace in it.
 */
export async function focusPage(
  input: Pick<NativeInput, 'click' | 'bringToFront'>,
  page: ReloadablePage,
) {
  if (await input.bringToFront(page)) {
    await page.bringToFront();
    return;
  }
  const geometry = parseWindowGeometry(await page.evaluate(READ_GEOMETRY_SCRIPT));
  await input.click(contentCornerPoint(geometry));
  await page.reload();
}
