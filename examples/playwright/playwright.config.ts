import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import type {
  SpeechCaptureOptions,
  SpeechCaptureWorkerOptions,
} from 'screenreader-speech-capture-client/playwright';

// SR_SPEECH_URL from .env.local (a copy of .env.example), if there is one. A variable set in the
// shell wins: loadEnvFile doesn't overwrite.
const envFile = fileURLToPath(new URL('.env.local', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig<SpeechCaptureOptions & SpeechCaptureWorkerOptions>({
  testDir: 'tests',
  // One screen reader, one foreground window: tests must run one after the other.
  workers: 1,
  use: {
    // The bridge on the VM. Default: SR_SPEECH_URL, the stored URL, then http://localhost:5151.
    speechCaptureUrl: process.env['SR_SPEECH_URL'],
    // The browsers real users run.
    channel: 'chrome',
  },
});
