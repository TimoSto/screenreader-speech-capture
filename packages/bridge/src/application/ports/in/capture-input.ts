import { API_LIMITS } from '@screenreader-speech-capture/shared';
import type { SpeechEntry } from '../../../domain/speech-entry.js';
import type { ClickRequest, PressKeysRequest } from './send-native-input.js';

/** Defaults and ranges of the capture options, in milliseconds. */
export const CAPTURE_LIMITS = API_LIMITS.capture;

/** How the speech an input causes is recorded (docs/usage/native-input.md#capturing-the-speech-an-input-causes). */
export interface CaptureOptions {
  /** The capture ends when nothing was spoken for this long. */
  quietForMs?: number | undefined;
  /** How long the first speech may take after the input. */
  firstWithinMs?: number | undefined;
  /** Longest capture, counted from the input. */
  timeoutMs?: number | undefined;
  /** Before the input, wait (at most `timeoutMs`) until nothing was spoken for this long. */
  settleMs?: number | undefined;
}

export interface CaptureRequest {
  capture: CaptureOptions;
  /** Aborts the capture, for example when the HTTP client disconnects. */
  signal?: AbortSignal | undefined;
}

/**
 * What an input caused. Every status is a result, not a failure: the input was sent.
 * `silent`: speech came and paused. `no-speech`: none within `firstWithinMs`. `timeout`: speech
 * went on until `timeoutMs`.
 */
export interface InputCaptureResult {
  status: 'silent' | 'no-speech' | 'timeout';
  /** The newest `seq` right before the input: the capture holds the speech after it. */
  startSeq: number;
  /** Speech entries (no markers), oldest first, at most `CAPTURE_LIMITS.entries`. */
  entries: SpeechEntry[];
  /** How many later speech entries were left out. */
  omitted: number;
  /** Entries after `startSeq` were dropped from the full buffer. */
  truncated: boolean;
}

/**
 * Native input that also records the speech it causes, on the bridge, where the speech and the
 * input are: the start is read in the input queue right before the input, and silence is timed
 * from when the bridge received the speech. Rejects like `SendNativeInput`, with
 * `INVALID_REQUEST` for bad capture options, `SERVICE_UNAVAILABLE` on shutdown, or the signal's
 * reason when aborted.
 */
export interface CaptureInput {
  click(request: ClickRequest & CaptureRequest): Promise<InputCaptureResult>;
  pressKeys(request: PressKeysRequest & CaptureRequest): Promise<InputCaptureResult>;
}
