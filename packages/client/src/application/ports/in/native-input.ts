import type { ElementBox, MouseButton, ScreenPoint } from '../../../domain/native-input.js';

export interface ClickOptions {
  /** Default `left`. */
  button?: MouseButton | undefined;
}

export interface PressKeysOptions {
  /** Pause between the chords of a sequence in milliseconds. Default: the bridge's (50). */
  delayMs?: number | undefined;
}

/** The element `setFocus` clicks in the middle of, for example a Playwright `Locator`. */
export interface FocusTarget {
  boundingBox(): Promise<ElementBox | null>;
}

/**
 * What `setFocus` needs from a browser page. Structurally a Playwright `Page`, so a page can be
 * passed as it is, without the client depending on Playwright.
 */
export interface FocusablePage {
  evaluate(expression: string): Promise<unknown>;
}

export interface SetFocusOptions {
  /** Click this element's centre instead of the title bar. */
  target?: FocusTarget | undefined;
}

/**
 * Native mouse and keyboard input on the VM through the bridge (docs/usage/native-input.md), for
 * what Playwright can't do: screen reader commands and making a window the foreground window.
 * Rejects with `BridgeHttpError` code `INPUT_DISABLED` when the bridge can't send input.
 */
export interface NativeInput {
  /** A native click at a screen point in physical pixels (`POST /api/v1/input/click`). */
  click(point: ScreenPoint, options?: ClickOptions): Promise<void>;
  /** Presses one chord (`'Insert+T'`) or a sequence (`['h', 'h']`) (`POST /api/v1/input/keys`). */
  pressKeys(keys: string | readonly string[], options?: PressKeysOptions): Promise<void>;
  /** Makes the page's browser window the foreground window with a native click. */
  setFocus(page: FocusablePage, options?: SetFocusOptions): Promise<void>;
}
