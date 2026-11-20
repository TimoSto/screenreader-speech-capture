import {
  parseCollapsed,
  serializeCollapsed,
  type SessionsPaneStorage,
} from '#lib/core/sessions-pane.js';

export const SESSIONS_PANE_STORAGE_KEY = 'sr-sessions-collapsed';

/** Keeps the sessions pane's collapsed choice in `localStorage`. */
export class BrowserSessionsPaneStorage implements SessionsPaneStorage {
  read(): boolean | null {
    try {
      return parseCollapsed(localStorage.getItem(SESSIONS_PANE_STORAGE_KEY));
    } catch {
      return null; // blocked storage, or running on the server
    }
  }

  write(collapsed: boolean): void {
    try {
      localStorage.setItem(SESSIONS_PANE_STORAGE_KEY, serializeCollapsed(collapsed));
    } catch {
      // the choice still applies for this page view
    }
  }
}
