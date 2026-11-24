import type { MouseButton } from '../src/application/ports/in/send-native-input.js';
import type { InputInjector } from '../src/application/ports/out/input-injector.js';
import type { ConfigStore } from '../src/application/ports/out/config-store.js';
import type { Logger } from '../src/application/ports/out/logger.js';
import type { SpeechEventBus } from '../src/application/ports/out/speech-event-bus.js';
import type { SpeechEvent, SpeechListener } from '../src/domain/speech-event.js';
import type { ConfigPatch } from '../src/domain/config/index.js';
import type { AppWindow, WindowSystem } from '../src/application/ports/out/window-system.js';

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

/** Injector that records what it was asked to do, as `"click left 1,2"`, `"down insert"`, … */
export class RecordingInputInjector implements InputInjector {
  readonly calls: string[] = [];
  /** Makes `keyTap` of this key fail. */
  failOn: string | undefined;

  click(x: number, y: number, button: MouseButton): Promise<void> {
    this.calls.push(`click ${button} ${x},${y}`);
    return Promise.resolve();
  }

  keyDown(key: string): Promise<void> {
    this.calls.push(`down ${key}`);
    return Promise.resolve();
  }

  keyUp(key: string): Promise<void> {
    this.calls.push(`up ${key}`);
    return Promise.resolve();
  }

  keyTap(key: string): Promise<void> {
    if (key === this.failOn) return Promise.reject(new Error(`cannot tap ${key}`));
    this.calls.push(`tap ${key}`);
    return Promise.resolve();
  }
}

/**
 * A window system with scripted processes and windows (front to back). `bringToFront` moves the
 * window to the front and reports success unless `refuse` is set.
 */
export class FakeWindowSystem implements WindowSystem {
  /** Child pid → parent pid. */
  parents = new Map<number, number>();
  windows: AppWindow[] = [];
  refuse = false;
  readonly focused: AppWindow[] = [];

  processTree(rootPid: number): Promise<Set<number>> {
    const tree = new Set([rootPid]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [child, parent] of this.parents) {
        if (tree.has(parent) && !tree.has(child)) {
          tree.add(child);
          grew = true;
        }
      }
    }
    return Promise.resolve(tree);
  }

  topLevelWindows(): Promise<AppWindow[]> {
    return Promise.resolve([...this.windows]);
  }

  bringToFront(window: AppWindow): Promise<boolean> {
    if (this.refuse) return Promise.resolve(false);
    this.focused.push(window);
    this.windows = [window, ...this.windows.filter((w) => w !== window)];
    return Promise.resolve(true);
  }

  /** Adds a window owned by `pid`, behind the others. */
  addWindow(pid: number, title: string, className = 'Chrome_WidgetWin_1'): AppWindow {
    const window = { handle: this.windows.length + 1, pid, title, className };
    this.windows.push(window);
    return window;
  }
}
