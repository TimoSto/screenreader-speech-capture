import { BridgeRestartedError } from '../../domain/errors.js';
import type { SpeechFeedEvent } from '../../domain/feed-event.js';
import { isSpeech, type SpeechEntry } from '../../domain/speech-entry.js';
import type { OnSpeechOptions } from '../ports/in/speech-capture.js';
import { speechEvents, type SpeechEventsDeps } from './speech-events.js';

export type LiveFeedDeps = SpeechEventsDeps;

type Listener = (entry: SpeechEntry) => void;

/**
 * Starts the live feed (`onSpeech`): it delivers the bridge's SSE events to `listener` and the
 * `options` callbacks, and reconnects with backoff until unsubscribed or a fatal error.
 * Returns the unsubscribe function.
 */
export function startLiveFeed(
  deps: LiveFeedDeps,
  listener: Listener,
  options: OnSpeechOptions = {},
): () => void {
  const controller = new AbortController();
  void new LiveFeed(deps, listener, options, controller.signal).run();
  return () => controller.abort();
}

/** One subscription: dispatches the events of {@link speechEvents} to the listener and callbacks. */
class LiveFeed {
  constructor(
    private readonly deps: LiveFeedDeps,
    private readonly listener: Listener,
    private readonly options: OnSpeechOptions,
    private readonly signal: AbortSignal,
  ) {}

  /** Runs until `signal` aborts or a fatal error. Never rejects. */
  async run(): Promise<void> {
    const { signal } = this;
    try {
      const events = speechEvents(this.deps, {
        since: this.options.since ?? null,
        signal,
        onRetry: (error) => this.#report(error, true),
      });
      for await (const event of events) {
        if (event.type === 'restarted') {
          const { previousInstanceId, instanceId } = event;
          this.#report(new BridgeRestartedError(previousInstanceId, instanceId), true);
        } else if (event.type !== 'bridge') {
          this.#dispatch(event);
        }
      }
    } catch (error) {
      this.#report(error, false);
    }
  }

  #dispatch(event: Exclude<SpeechFeedEvent, { type: 'bridge' }>): void {
    const { options } = this;
    switch (event.type) {
      case 'entry': {
        const { entry } = event;
        if (options.includeMarkers || isSpeech(entry)) this.#notify(() => this.listener(entry));
        break;
      }
      case 'session': {
        const { session } = event;
        this.#notify(() => options.onSession?.(session));
        break;
      }
      case 'clear':
        this.#notify(() => options.onClear?.());
        break;
      case 'truncated':
        this.#notify(() => options.onTruncated?.());
        break;
    }
  }

  /** Runs a user callback; a throw is reported and the feed goes on. */
  #notify(callback: () => void): void {
    try {
      callback();
    } catch (error) {
      this.#report(error, true);
    }
  }

  #report(error: unknown, retrying: boolean): void {
    if (this.signal.aborted) return;
    try {
      this.options.onError?.(toError(error), { retrying });
    } catch {
      // An onError that throws has nowhere left to report to.
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
