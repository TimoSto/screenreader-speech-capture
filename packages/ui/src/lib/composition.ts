import { BrowserThemeStorage } from '#lib/adapters/browser-theme-storage.js';
import { createThemeStore } from '#lib/stores/theme.svelte.js';

/** Wires the adapters into the stores; components get the stores, never the adapters. */
export const themeStore = createThemeStore(new BrowserThemeStorage());
