import type { SpeechListener } from '../../../domain/speech-event.js';

export interface WatchSpeech {
  /**
   * Calls `listener` with every new entry and clear, until the returned function is called.
   * With `since`, it first gets the buffered entries with `seq > since` (an SSE reconnect with
   * `Last-Event-ID`), with nothing missed or repeated in between.
   */
  watch(since: number | null, listener: SpeechListener): () => void;
}
