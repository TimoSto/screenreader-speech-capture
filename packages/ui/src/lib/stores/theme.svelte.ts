import { DEFAULT_THEME, type Theme, type ThemeStorage } from '#lib/core/theme.js';

export function createThemeStore(storage: ThemeStorage) {
  let current = $state<Theme>(DEFAULT_THEME);
  return {
    get current() {
      return current;
    },
    /** Pick up the saved choice. Call it in the browser only, after hydration. */
    init() {
      current = storage.read() ?? DEFAULT_THEME;
    },
    /** Apply and remember a choice. */
    set(theme: Theme) {
      current = theme;
      storage.write(theme);
    },
  };
}
