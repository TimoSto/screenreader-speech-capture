import { Worker } from 'node:worker_threads';

// Writing to a Windows console is synchronous, and it blocks while the person has selected text
// in the console window (QuickEdit). On the main thread that stops the whole bridge: HTTP, the
// speech socket, the child services (docs/usage/troubleshooting.md#bridge-stops-answering).
// So console lines are written by a worker thread, which is the only thing a stuck console blocks.

/** What the console writer needs from its worker, so tests can pass a fake. */
export interface ConsoleChannel {
  /** Sends text to be written. */
  post(text: string): void;
  /** Asks to be told when everything posted so far is written. */
  requestFlush(id: number): void;
  /** `written`: bytes of text the console has taken. `flushed`: the answer to `requestFlush`. */
  onMessage(listener: (message: { written: number } | { flushed: number }) => void): void;
  /** The worker died: later lines go through `fallback`. */
  onFailure(listener: () => void): void;
}

export interface AsyncConsole {
  write(text: string): void;
  /** Resolves when everything written so far is out, or after `timeoutMs` if the console is stuck. */
  flush(timeoutMs?: number): Promise<void>;
}

interface AsyncConsoleOptions {
  channel: ConsoleChannel;
  /** Used when the worker is gone. */
  fallback: (text: string) => void;
  /** Text that may wait for a stuck console before new lines are dropped. Default 1 MiB. */
  maxPendingBytes?: number;
}

const MAX_PENDING_BYTES = 1024 * 1024;
const FLUSH_TIMEOUT_MS = 1000;

/**
 * Hands text to `channel` without ever blocking. While the console is stuck, text piles up to
 * `maxPendingBytes`, then new lines are dropped (the log file keeps everything). When the console
 * takes text again, a line says how many were dropped.
 */
export function createAsyncConsole(options: AsyncConsoleOptions): AsyncConsole {
  const { channel, fallback, maxPendingBytes = MAX_PENDING_BYTES } = options;
  let pending = 0;
  let dropped = 0;
  let failed = false;
  let nextFlush = 0;
  const waiting = new Map<number, () => void>();

  channel.onMessage((message) => {
    if ('written' in message) {
      pending = Math.max(0, pending - message.written);
      return;
    }
    waiting.get(message.flushed)?.();
  });
  channel.onFailure(() => {
    failed = true;
    for (const done of waiting.values()) done();
  });

  return {
    write(text) {
      if (failed) return fallback(text);
      if (pending >= maxPendingBytes) {
        dropped += 1;
        return;
      }
      if (dropped > 0) {
        const notice = `console output was blocked, ${dropped} lines dropped (see the log file)\n`;
        dropped = 0;
        pending += Buffer.byteLength(notice);
        channel.post(notice);
      }
      pending += Buffer.byteLength(text);
      channel.post(text);
    },
    flush(timeoutMs = FLUSH_TIMEOUT_MS) {
      if (failed) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const id = nextFlush++;
        const finish = () => {
          clearTimeout(timer);
          waiting.delete(id);
          resolve();
        };
        const timer = setTimeout(finish, timeoutMs);
        waiting.set(id, finish);
        channel.requestFlush(id);
      });
    },
  };
}

// Runs in the worker: its own handle to the console, so `write` blocks this thread only.
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const tty = require('node:tty');
const stream = new tty.WriteStream(workerData.fd);
stream.on('error', () => {});
parentPort.on('message', (message) => {
  if (message.flush !== undefined) {
    stream.write('', () => parentPort.postMessage({ flushed: message.flush }));
    return;
  }
  const bytes = Buffer.byteLength(message.text);
  stream.write(message.text, () => parentPort.postMessage({ written: bytes }));
});
`;

function workerChannel(fd: number): ConsoleChannel {
  const worker = new Worker(WORKER_SOURCE, { eval: true, workerData: { fd } });
  // A console that never answers must not keep the bridge from exiting.
  worker.unref();
  return {
    post: (text) => worker.postMessage({ text }),
    requestFlush: (id) => worker.postMessage({ flush: id }),
    onMessage: (listener) => worker.on('message', listener),
    onFailure: (listener) => {
      worker.on('error', listener);
      worker.on('exit', listener);
    },
  };
}

let console_: AsyncConsole | undefined;

/**
 * A writer for stdout that can't block the bridge, or `undefined` when stdout is not a terminal
 * (a pipe or file has no selection mode, and `process.stdout` is fine there).
 */
export function terminalWriter(
  stream: NodeJS.WriteStream = process.stdout,
): ((text: string) => void) | undefined {
  if (stream.isTTY !== true) return undefined;
  try {
    console_ ??= createAsyncConsole({
      channel: workerChannel(1),
      fallback: (text) => void stream.write(text),
    });
  } catch {
    return undefined;
  }
  const writer = console_;
  return (text) => writer.write(text);
}

/** Waits (briefly) until the terminal writer has written everything. */
export function flushTerminal(): Promise<void> {
  return console_?.flush() ?? Promise.resolve();
}
