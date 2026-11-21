export type Theme = 'light' | 'dark' | 'high-contrast' | 'dark-high-contrast';

export const DEFAULT_THEME: Theme = 'light';

/** The choices in the order the settings page lists them. */
export const THEMES: readonly { value: Theme; label: string; description: string }[] = [
  { value: 'light', label: 'Light', description: 'Default light scheme.' },
  { value: 'dark', label: 'Dark', description: 'Default dark scheme.' },
  {
    value: 'high-contrast',
    label: 'High contrast',
    description: 'White surface, black text, 2px outlines.',
  },
  {
    value: 'dark-high-contrast',
    label: 'Dark high contrast',
    description: 'Black surface, white text, 2px outlines.',
  },
];

/** Where the chosen theme is remembered and applied (the browser adapter implements it). */
export interface ThemeStorage {
  /** The saved choice, or `null` when there is none or it can't be read. */
  read(): Theme | null;
  /** Remember the choice and make it take effect. */
  write(theme: Theme): void;
}

export function parseTheme(raw: unknown): Theme | null {
  return THEMES.find((t) => t.value === raw)?.value ?? null;
}
