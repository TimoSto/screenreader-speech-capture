import type { FOCUS_TARGETS } from '@screenreader-speech-capture/shared';

/** Whose browser: Playwright MCP's, or one the Playwright server launched for a test. */
export type FocusTarget = (typeof FOCUS_TARGETS)[number];

export interface FocusRequest {
  target: FocusTarget;
  /** Only a window whose title contains this text (a marker put into `document.title`). */
  title?: string | undefined;
}

/** The window that is now in front. */
export interface FocusedWindow {
  title: string;
  pid: number;
}

/**
 * Brings a browser window the bridge started to the front
 * (docs/usage/native-input.md#bringing-the-browser-to-the-front). Rejects with `INVALID_REQUEST`
 * for a bad request, `NOT_FOUND` when there is no such window, `INPUT_DISABLED` where windows
 * can't be managed, and `FOCUS_FAILED` when Windows refused.
 */
export interface FocusWindow {
  focus(request: FocusRequest): Promise<FocusedWindow>;
}
