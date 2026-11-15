export type Theme = 'light' | 'dark';

export const DEFAULT_THEME: Theme = 'light';

/** Where the chosen theme is remembered and applied (the browser adapter implements it). */
export interface ThemeStorage {
  /** The saved choice, or `null` when there is none or it can't be read. */
  read(): Theme | null;
  /** Remember the choice and make it take effect. */
  write(theme: Theme): void;
}

export function parseTheme(raw: unknown): Theme | null {
  return raw === 'light' || raw === 'dark' ? raw : null;
}

export function toggleTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light';
}
