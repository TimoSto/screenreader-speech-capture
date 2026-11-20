/** Where the sessions pane's collapsed choice is kept. */
export interface SessionsPaneStorage {
  /** `null` when nothing is saved or the storage is not available. */
  read(): boolean | null;
  write(collapsed: boolean): void;
}

/** Parses the stored text; anything but `'1'` / `'0'` counts as no choice. */
export function parseCollapsed(raw: string | null): boolean | null {
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

export function serializeCollapsed(collapsed: boolean): string {
  return collapsed ? '1' : '0';
}
