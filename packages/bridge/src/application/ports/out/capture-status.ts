import type { CaptureStatus } from '../../../domain/capture.js';

/** State of the speech capture adapter (listener and open connections), for the status. */
export interface CaptureStatusSource {
  captureStatus(): CaptureStatus;
}
