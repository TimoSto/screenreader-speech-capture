import type { FocusedWindowDto, InputCaptureDto } from '@screenreader-speech-capture/shared';
import type { InputCaptureResult } from '../../../../application/ports/in/capture-input.js';
import type { FocusedWindow } from '../../../../application/ports/in/focus-window.js';
import { toSpeechEntryDto } from './speech.js';

export function toInputCaptureDto(result: InputCaptureResult): InputCaptureDto {
  return {
    status: result.status,
    startSeq: result.startSeq,
    entries: result.entries.map(toSpeechEntryDto),
    omitted: result.omitted,
    truncated: result.truncated,
  };
}

export function toFocusedWindowDto(window: FocusedWindow): FocusedWindowDto {
  return { title: window.title, pid: window.pid };
}
