import { parseTheme, type Theme, type ThemeStorage } from '#lib/core/theme.js';

export const THEME_STORAGE_KEY = 'sr-theme';

/** Keeps the theme in `localStorage` and applies it as `data-theme` on `<html>`. */
export class BrowserThemeStorage implements ThemeStorage {
  read(): Theme | null {
    try {
      return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
    } catch {
      return null; // blocked storage, or running on the server
    }
  }

  write(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // the theme still applies for this page view
    }
  }
}
