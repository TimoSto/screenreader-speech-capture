import type { ConfigStore } from '../src/application/ports/out/config-store.js';
import type { Logger } from '../src/application/ports/out/logger.js';
import type { SpeechEventBus } from '../src/application/ports/out/speech-event-bus.js';
import type { SpeechEvent, SpeechListener } from '../src/domain/speech-event.js';
import type { ConfigPatch } from '../src/domain/config/index.js';

/** Logger that keeps its messages, as `"<level> <message>"`. */
export class MemoryLogger implements Logger {
  readonly lines: string[] = [];
  error = (message: string) => void this.lines.push(`error ${message}`);
  warn = (message: string) => void this.lines.push(`warn ${message}`);
  info = (message: string) => void this.lines.push(`info ${message}`);
  debug = (message: string) => void this.lines.push(`debug ${message}`);
}

/** Config store in memory. `failSave` makes the next saves fail. */
export class MemoryConfigStore implements ConfigStore {
  readonly location = 'memory:config.json';
  saved: ConfigPatch | undefined;
  failSave = false;

  constructor(private readonly initial: unknown = undefined) {}

  load(): Promise<unknown> {
    return Promise.resolve(this.saved ?? this.initial);
  }

  save(file: ConfigPatch): Promise<void> {
    if (this.failSave) return Promise.reject(new Error('disk full'));
    this.saved = file;
    return Promise.resolve();
  }
}

/**
 * An event bus that delivers late: `publish` only queues, `flush()` delivers in publish order to
 * the listeners that were subscribed at publish time and still are. What the `SpeechEventBus`
 * contract allows, and what an asynchronous bus would do.
 */
export class DeferredEventBus implements SpeechEventBus {
  readonly #listeners = new Set<SpeechListener>();
  #queue: { event: SpeechEvent; to: SpeechListener[] }[] = [];

  publish(event: SpeechEvent): void {
    this.#queue.push({ event, to: [...this.#listeners] });
  }

  subscribe(listener: SpeechListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Delivers everything queued so far. */
  flush(): void {
    const queue = this.#queue;
    this.#queue = [];
    for (const { event, to } of queue) {
      for (const listener of to) if (this.#listeners.has(listener)) listener(event);
    }
  }
}
