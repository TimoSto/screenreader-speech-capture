/** The message of a `SpeechTimeoutError` when speech didn't pause. */
export function silenceFailure(quietFor: number, timeout: number): string {
  return `Speech did not pause for ${quietFor} ms within ${timeout} ms`;
}
