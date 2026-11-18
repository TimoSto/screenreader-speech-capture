import { BrowserThemeStorage } from '#lib/adapters/browser-theme-storage.js';
import { BrowserTicker } from '#lib/adapters/browser-ticker.js';
import { HttpStatusApi } from '#lib/adapters/http-status-api.js';
import { createStatusStore } from '#lib/stores/status.svelte.js';
import { createThemeStore } from '#lib/stores/theme.svelte.js';

/** Wires the adapters into the stores; components get the stores, never the adapters. */
export const themeStore = createThemeStore(new BrowserThemeStorage());
export const statusStore = createStatusStore(new HttpStatusApi(), new BrowserTicker());
