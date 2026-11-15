import type { SpeechCapture } from '../../../application/ports/in/speech-capture.js';

/** When the fixture attaches the speech transcript of a test to the Playwright report. */
export type AttachMode = 'always' | 'on-failure' | 'off';

/** The parts of Playwright's `TestInfo` the session handling needs. */
export interface TestInfoLike {
  titlePath: string[];
  status?: string | undefined;
  expectedStatus: string;
  attach(name: string, options: { body: string; contentType: string }): Promise<void>;
}

/** Name of a test's session: its title path without the project/file prefix. */
export function sessionName(titlePath: readonly string[]): string {
  // Playwright's titlePath starts with the file name (and project); keep file and titles.
  return titlePath.filter((part) => part !== '').join(' › ');
}

/**
 * One session per test (docs/usage/client.md#playwright-fixture): starts it, runs the test body
 * (`use`), ends it and attaches the transcript. The buffer is not cleared.
 */
export async function withTestSession(
  speech: SpeechCapture,
  testInfo: TestInfoLike,
  options: { run: string; attach: AttachMode },
  use: () => Promise<void>,
): Promise<void> {
  const session = await speech.startSession(sessionName(testInfo.titlePath), { run: options.run });
  try {
    await use();
  } finally {
    const failed = testInfo.status !== undefined && testInfo.status !== testInfo.expectedStatus;
    const wantsTranscript =
      options.attach === 'always' || (options.attach === 'on-failure' && failed);
    // Read before ending: speech after the end belongs to no session.
    let transcript: string | undefined;
    if (wantsTranscript) {
      transcript = await speech.getText({ session: session.id, since: session.startSeq });
    }
    await speech.endSession();
    if (transcript !== undefined) {
      await testInfo.attach('speech-transcript', {
        body: transcript === '' ? '(no speech)' : transcript,
        contentType: 'text/plain',
      });
    }
  }
}
