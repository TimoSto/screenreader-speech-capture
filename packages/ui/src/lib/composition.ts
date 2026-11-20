import { resolve } from '$app/paths';
import { BrowserThemeStorage } from '#lib/adapters/browser-theme-storage.js';
import { markIconFontReady } from '#lib/adapters/icon-font.js';
import { HttpSessionsApi } from '#lib/adapters/http-sessions-api.js';
import { HttpStatusApi } from '#lib/adapters/http-status-api.js';
import { createSessionsStore } from '#lib/stores/sessions.svelte.js';
import { createStatusStore } from '#lib/stores/status.svelte.js';
import { createThemeStore } from '#lib/stores/theme.svelte.js';

/** Wires the adapters into the stores; components get the stores, never the adapters. */
export const themeStore = createThemeStore(new BrowserThemeStorage());
export const statusStore = createStatusStore(new HttpStatusApi(resolve('/api/status')));
export const sessionsStore = createSessionsStore(new HttpSessionsApi(resolve('/api/sessions')));

/** Ends the icon placeholder shimmer once the icon font is loaded. */
export { markIconFontReady };
