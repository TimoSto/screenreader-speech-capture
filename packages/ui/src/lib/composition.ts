import { getContext, setContext } from 'svelte';
import { resolve } from '$app/paths';
import { BrowserThemeStorage } from '#lib/adapters/browser-theme-storage.js';
import { markIconFontReady } from '#lib/adapters/icon-font.js';
import { HttpConfigApi } from '#lib/adapters/http-config-api.js';
import { HttpKeysApi } from '#lib/adapters/http-keys-api.js';
import { HttpSpeechApi } from '#lib/adapters/http-speech-api.js';
import { HttpSessionsApi } from '#lib/adapters/http-sessions-api.js';
import { SseSpeechFeed } from '#lib/adapters/sse-speech-feed.js';
import { HttpStatusApi } from '#lib/adapters/http-status-api.js';
import { BrowserSessionsPaneStorage } from '#lib/adapters/browser-sessions-pane-storage.js';
import { createConfigStore } from '#lib/stores/config.svelte.js';
import { createSessionsPaneStore } from '#lib/stores/sessions-pane.svelte.js';
import { createSessionsStore } from '#lib/stores/sessions.svelte.js';
import { createSpeechStore } from '#lib/stores/speech.svelte.js';
import { createStatusStore } from '#lib/stores/status.svelte.js';
import { createThemeStore } from '#lib/stores/theme.svelte.js';
import { createVoiceCheckStore } from '#lib/stores/voice-check.svelte.js';

/** Wires the adapters into the stores; components get the stores, never the adapters. */
export function createAppStores() {
  const statusApi = new HttpStatusApi(resolve('/api/status'));
  const speechFeed = new SseSpeechFeed(resolve('/api/speech/stream'), resolve('/api/speech'));
  const speechApi = new HttpSpeechApi(resolve('/api/markers'), resolve('/api/speech'));
  return {
    theme: createThemeStore(new BrowserThemeStorage()),
    status: createStatusStore(statusApi),
    config: createConfigStore(new HttpConfigApi(resolve('/api/config'))),
    sessions: createSessionsStore(new HttpSessionsApi(resolve('/api/sessions'))),
    speech: createSpeechStore(speechFeed, speechApi),
    voiceCheck: createVoiceCheckStore(
      statusApi,
      speechFeed,
      new HttpKeysApi(resolve('/api/input/keys')),
      speechApi,
    ),
    sessionsPane: createSessionsPaneStore(new BrowserSessionsPaneStorage()),
  };
}

export type AppStores = ReturnType<typeof createAppStores>;

/** The context key of the stores (component tests pass their own stores under it). */
export const APP_STORES = Symbol('app-stores');

/**
 * Creates the stores of one app and hands them to the components below (the root layout calls it).
 * Not a module-level singleton: on the server every request renders its own app, and a store
 * shared by all of them would show one viewer's state to another.
 */
export function provideAppStores(): AppStores {
  return setContext(APP_STORES, createAppStores());
}

/** The stores {@link provideAppStores} created. Call it while a component initialises. */
export function appStores(): AppStores {
  const stores = getContext<AppStores | undefined>(APP_STORES);
  if (stores === undefined) throw new Error('appStores() needs provideAppStores() in a parent');
  return stores;
}

/** Ends the icon placeholder shimmer once the icon font is loaded. */
export { markIconFontReady };
