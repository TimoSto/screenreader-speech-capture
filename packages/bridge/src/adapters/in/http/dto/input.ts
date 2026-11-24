import type { InputCaptureDto } from '@screenreader-speech-capture/shared';
import type { InputCaptureResult } from '../../../../application/ports/in/capture-input.js';
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
