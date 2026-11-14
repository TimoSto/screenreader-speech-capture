import type http from 'node:http';
import { setImmediate } from 'node:timers/promises';

export interface SseSettings {
  /** Interval of the `: ping` comment. */
  pingMs: number;
  /**
   * A stream whose client stops reading is closed once this many bytes wait in its buffer, so
   * a stalled client can't make the bridge buffer speech without limit. The client reconnects
   * with `Last-Event-ID` and gets the missed entries from the speech buffer.
   */
  maxBufferedBytes: number;
}

/** One open SSE stream. */
export interface SseStream {
  /** Writes one frame. Does nothing once the stream has ended. */
  send(frame: string): void;
  /** `false` once the stream has ended: frames for it needn't be built. */
  readonly open: boolean;
  /**
   * For a replay, after each frame: a promise to wait for before the next one, `undefined` to go
   * on. It waits while the client hasn't read what was written (backpressure), and every
   * {@link YIELD_EVERY} frames lets other work run (speech capture, other requests). Once the
   * stream has ended, it resolves when `onClose` has run.
   */
  pace(): Promise<void> | undefined;
}

/** A replay lets other work run after this many frames. */
export const YIELD_EVERY = 256;

/** The open Server-Sent Events responses: starts them, pings them and ends them on shutdown. */
export class SseHub {
  private readonly streams = new Set<http.ServerResponse>();

  constructor(private readonly settings: SseSettings) {}

  /** Starts the SSE response on `res`. `onClose` runs once when the stream ends. */
  open(res: http.ServerResponse, onClose: () => void): SseStream {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.flushHeaders();

    const isOpen = () => !res.destroyed && !res.writableEnded;
    const send = (frame: string) => {
      if (!isOpen()) return;
      res.write(frame);
      if (res.writableLength > this.settings.maxBufferedBytes) res.destroy();
    };
    const ping = setInterval(() => send(': ping\n\n'), this.settings.pingMs);
    ping.unref();
    this.streams.add(res);
    // Resolves after `onClose`, so a replay waiting on it finds its watch stopped.
    let markClosed!: () => void;
    const closed = new Promise<void>((resolve) => (markClosed = resolve));
    res.once('close', () => {
      clearInterval(ping);
      this.streams.delete(res);
      onClose();
      markClosed();
    });

    let paced = 0;
    const pace = (): Promise<void> | undefined => {
      if (!isOpen()) return closed;
      if (res.writableNeedDrain) {
        const drained = new Promise<void>((resolve) => res.once('drain', () => resolve()));
        return Promise.race([drained, closed]);
      }
      if (++paced % YIELD_EVERY === 0) return setImmediate();
      return undefined;
    };
    return {
      send,
      get open() {
        return isOpen();
      },
      pace,
    };
  }

  /** Ends the open streams, for shutdown. */
  close(): void {
    for (const res of this.streams) res.end();
  }
}
