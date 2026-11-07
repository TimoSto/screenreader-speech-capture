import type { SpeechEntry } from '../../../domain/speech-entry.js';

export interface AddMarker {
  addMarker(label: string): SpeechEntry;
}
