// Playwright fixture (docs/usage/client.md#playwright-fixture), the `./playwright` subpath export.
// A driving adapter wired here, like the CLI in `bin/`; the root entry never imports it, so
// `@playwright/test` stays an optional peer dependency.
import { test as base, expect } from '@playwright/test';
import { withTestSession, type AttachMode } from './adapters/in/playwright/test-session.js';
import { createClientConfig, SpeechCaptureClient } from './main.js';
import { playwrightEndpoint } from './domain/playwright-endpoint.js';
import { focusPage } from './adapters/in/playwright/focus.js';
import type {
  ClickOptions,
  InputRecording,
  InputRecordOptions,
  NativeInput,
  PressKeysOptions,
} from './application/ports/in/native-input.js';
import type { SpeechCapture } from './application/ports/in/speech-capture.js';
import type { ScreenPoint } from './domain/native-input.js';

export interface SpeechCaptureWorkerOptions {
  /** Bridge URL. Default: `SR_SPEECH_URL`, the stored URL, then `http://localhost:5151`. */
  speechCaptureUrl: string | undefined;
}

export interface SpeechCaptureOptions {
  /** Attach the speech transcript of a test to the report. Default `'always'`. */
  speechCaptureAttach: AttachMode;
  /**
   * Give the browser window OS-level focus before each test (`setFocus`), so native keys reach
   * the page. Default `true`; turn off where the bridge has no native input.
   */
  speechCaptureFocus: boolean;
}

/** The page-bound native input fixtures (docs/usage/native-input.md). */
export interface NativeInputFixtures {
  /** A native click at a screen point in physical pixels. */
  click: (point: ScreenPoint, options?: ClickOptions) => Promise<void>;
  /** Presses one chord (`'Insert+T'`) or a sequence (`['h', 'h']`) as native keys. */
  pressKeys: (keys: string | readonly string[], options?: PressKeysOptions) => Promise<void>;
  /**
   * `pressKeys` plus the speech the keys cause, recorded on the bridge from right before the keys
   * until the speech pauses (docs/usage/native-input.md#capturing-the-speech-an-input-causes).
   * Doesn't move the `speech` cursor.
   */
  recordKeys: (
    keys: string | readonly string[],
    options?: PressKeysOptions & InputRecordOptions,
  ) => Promise<InputRecording>;
  /**
   * Gives the page's browser window OS-level focus: the bridge brings it to the front
   * (docs/usage/native-input.md#bringing-the-browser-to-the-front); where it can't, a native
   * click on the top-left corner of the page content, then a reload of the page.
   */
  setFocus: () => Promise<void>;
}

// One label per Playwright run: workers are children of the runner, so they share its pid.
const runLabel = process.env['SR_SPEECH_RUN'] ?? `playwright pid ${process.ppid}`;

interface Workers extends SpeechCaptureWorkerOptions {
  speechBridgeUrl: string;
}

interface Fixtures extends NativeInputFixtures, SpeechCaptureOptions {
  speech: SpeechCapture;
  speechClient: SpeechCapture & NativeInput;
  speechFocus: undefined;
}

export const test = base.extend<Fixtures, Workers>({
  speechCaptureUrl: [undefined, { option: true, scope: 'worker' }],
  speechCaptureAttach: ['always', { option: true }],
  speechCaptureFocus: [true, { option: true }],

  speechBridgeUrl: [
    async ({ speechCaptureUrl }, use) => {
      const { value } = await createClientConfig().get('url', { url: speechCaptureUrl });
      await use(value);
    },
    { scope: 'worker' },
  ],

  // Connect to the bridge's Playwright server, so the browser opens on the VM's desktop where
  // the screen reader runs. `headless` is forced to false below: the server gets it from here.
  connectOptions: [
    async ({ speechBridgeUrl }, use) => {
      await use({ wsEndpoint: playwrightEndpoint(speechBridgeUrl) });
    },
    { scope: 'worker' },
  ],
  headless: [false, { scope: 'worker' }],

  // One client per test, shared by `speech` and the native input fixtures.
  speechClient: async ({ speechBridgeUrl }, use) => {
    await use(new SpeechCaptureClient({ baseUrl: speechBridgeUrl }));
  },

  speech: [
    async ({ speechClient, speechCaptureAttach }, use, testInfo) => {
      await withTestSession(
        speechClient,
        testInfo,
        { run: runLabel, attach: speechCaptureAttach },
        () => use(speechClient),
      );
    },
    // Auto: the session also covers tests that only use `page`.
    { auto: true },
  ],

  click: async ({ speechClient }, use) => {
    await use((point, options) => speechClient.click(point, options));
  },
  pressKeys: async ({ speechClient }, use) => {
    await use((keys, options) => speechClient.pressKeys(keys, options));
  },
  recordKeys: async ({ speechClient }, use) => {
    await use((keys, options) => speechClient.recordKeys(keys, options));
  },
  setFocus: async ({ speechClient, page }, use) => {
    await use(() => focusPage(speechClient, page));
  },

  // Auto: focus the window once the session runs, so its speech belongs to the test.
  speechFocus: [
    async ({ speech: _speech, setFocus, speechCaptureFocus }, use) => {
      if (speechCaptureFocus) await setFocus();
      await use(undefined);
    },
    { auto: true },
  ],
});

export { expect };
export type { NativeInput, SpeechCapture };
