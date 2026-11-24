import type { ElementBox, MouseButton, ScreenPoint } from '../../../domain/native-input.js';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import type { RecordOptions } from './speech-capture.js';

export interface ClickOptions {
  /** Default `left`. */
  button?: MouseButton | undefined;
}

export interface PressKeysOptions {
  /** Pause between the chords of a sequence in milliseconds. Default: the bridge's (50). */
  delayMs?: number | undefined;
}

export interface InputRecordOptions extends RecordOptions {
  /**
   * Milliseconds without speech to wait for before the input, so speech still trailing from an
   * earlier step isn't recorded. Waits at most `timeout`, then sends the input anyway. Default 0.
   */
  settle?: number | undefined;
}

/** The speech an input caused, recorded on the bridge. */
export interface InputRecording {
  /** Speech after the input, oldest first. Empty: nothing was said within `firstWithin`. */
  entries: SpeechEntry[];
  /**
   * Some of that speech is missing: dropped from the bridge's full buffer, or more than the
   * bridge sends in one answer (10000 entries).
   */
  truncated: boolean;
  /** The `seq` of the newest entry right before the input: the recording is the speech after it. */
  startSeq: number;
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
  /**
   * Clicks and records the speech the click causes, on the bridge (API 1.19,
   * docs/usage/native-input.md#capturing-the-speech-an-input-causes): like `record()`, it waits
   * up to `firstWithin` ms for the first speech, then until nothing was said for `quietFor` ms,
   * but the start is taken right before the click and silence is timed where the speech arrives.
   * Rejects with `SpeechTimeoutError` (with the speech so far) if speech goes on until
   * `timeout`; the click has happened. Does not move the speech cursor.
   */
  recordClick(
    point: ScreenPoint,
    options?: ClickOptions & InputRecordOptions,
  ): Promise<InputRecording>;
  /** `pressKeys` that records the speech the keys cause, like `recordClick`. */
  recordKeys(
    keys: string | readonly string[],
    options?: PressKeysOptions & InputRecordOptions,
  ): Promise<InputRecording>;
  /** Makes the page's browser window the foreground window with a native click. */
  setFocus(page: FocusablePage, options?: SetFocusOptions): Promise<void>;
}
