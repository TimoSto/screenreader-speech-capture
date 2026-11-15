import { defineConfig } from '@playwright/test';
import type {
  SpeechCaptureOptions,
  SpeechCaptureWorkerOptions,
} from 'screenreader-speech-capture-client/playwright';

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
