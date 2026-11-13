import type http from 'node:http';

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

/** Writes one SSE frame to a stream. */
export type SseSend = (frame: string) => void;

/** The open Server-Sent Events responses: starts them, pings them and ends them on shutdown. */
export class SseHub {
  private readonly streams = new Set<http.ServerResponse>();

  constructor(private readonly settings: SseSettings) {}

  /** Starts the SSE response on `res`. `onClose` runs once when the stream ends. */
  open(res: http.ServerResponse, onClose: () => void): SseSend {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.flushHeaders();

    const send: SseSend = (frame) => {
      if (res.destroyed || res.writableEnded) return;
      res.write(frame);
      if (res.writableLength > this.settings.maxBufferedBytes) res.destroy();
    };
    const ping = setInterval(() => send(': ping\n\n'), this.settings.pingMs);
    ping.unref();
    this.streams.add(res);
    res.once('close', () => {
      clearInterval(ping);
      this.streams.delete(res);
      onClose();
    });
    return send;
  }

  /** Ends every open stream, for shutdown. */
  closeAll(): void {
    for (const res of this.streams) res.end();
  }
}
