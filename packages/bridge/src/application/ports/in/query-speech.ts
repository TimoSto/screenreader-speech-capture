import type { SpeechPage } from '../../../domain/speech-buffer.js';

export interface QuerySpeech {
  list(options: { since: number; limit: number }): SpeechPage;
}
