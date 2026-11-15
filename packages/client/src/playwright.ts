// Playwright fixture (docs/usage/client.md#playwright-fixture), the `./playwright` subpath export.
// A driving adapter wired here, like the CLI in `bin/`; the root entry never imports it, so
// `@playwright/test` stays an optional peer dependency.
import { test as base, expect } from '@playwright/test';
import { withTestSession, type AttachMode } from './adapters/in/playwright/test-session.js';
import { createClientConfig, SpeechCaptureClient } from './main.js';
import { playwrightEndpoint } from './domain/playwright-endpoint.js';
import type { SpeechCapture } from './application/ports/in/speech-capture.js';

export interface SpeechCaptureWorkerOptions {
  /** Bridge URL. Default: `SR_SPEECH_URL`, the stored URL, then `http://localhost:5151`. */
  speechCaptureUrl: string | undefined;
}

export interface SpeechCaptureOptions {
  /** Attach the speech transcript of a test to the report. Default `'always'`. */
  speechCaptureAttach: AttachMode;
}

// One label per Playwright run: workers are children of the runner, so they share its pid.
const runLabel = process.env['SR_SPEECH_RUN'] ?? `playwright pid ${process.ppid}`;

interface Workers extends SpeechCaptureWorkerOptions {
  speechBridgeUrl: string;
}

export const test = base.extend<{ speech: SpeechCapture } & SpeechCaptureOptions, Workers>({
  speechCaptureUrl: [undefined, { option: true, scope: 'worker' }],
  speechCaptureAttach: ['always', { option: true }],

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

  speech: [
    async ({ speechBridgeUrl, speechCaptureAttach }, use, testInfo) => {
      const client = new SpeechCaptureClient({ baseUrl: speechBridgeUrl });
      await withTestSession(client, testInfo, { run: runLabel, attach: speechCaptureAttach }, () =>
        use(client),
      );
    },
    // Auto: the session also covers tests that only use `page`.
    { auto: true },
  ],
});

export { expect };
export type { SpeechCapture };
