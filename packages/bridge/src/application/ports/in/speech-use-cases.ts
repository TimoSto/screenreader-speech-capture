import type { AddMarker } from './add-marker.js';
import type { ClearSpeech } from './clear-speech.js';
import type { QuerySpeech } from './query-speech.js';
import type { WatchSpeech } from './watch-speech.js';

/**
 * The speech buffer's use cases as the HTTP API and the composition root use them: read, clear,
 * mark and watch. The single ports stay for code that needs only one; `SpeechService` implements
 * all of them.
 */
export type SpeechUseCases = QuerySpeech & ClearSpeech & AddMarker & WatchSpeech;
