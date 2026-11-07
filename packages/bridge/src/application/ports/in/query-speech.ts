import type { SpeechPage } from '../out/speech-repository.js';

export interface QuerySpeech {
  list(options: { since: number; limit: number }): SpeechPage;
}
