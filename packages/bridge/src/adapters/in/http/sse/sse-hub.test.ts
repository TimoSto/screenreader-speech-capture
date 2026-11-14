import { EventEmitter } from 'node:events';
import type http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SseHub, YIELD_EVERY } from './sse-hub.js';

/** A response whose client reads nothing: every written byte stays buffered. */
class StalledResponse extends EventEmitter {
  written: string[] = [];
  writableLength = 0;
  destroyed = false;
  writableEnded = false;
  writableNeedDrain = false;
  headers: Record<string, string> | undefined;

  writeHead(_status: number, headers: Record<string, string>) {
    this.headers = headers;
    return this;
  }
  flushHeaders() {}
  write(chunk: string) {
    this.written.push(chunk);
    this.writableLength += chunk.length;
    return false;
  }
  destroy() {
    this.destroyed = true;
    queueMicrotask(() => this.emit('close'));
  }
  end() {
    this.writableEnded = true;
    queueMicrotask(() => this.emit('close'));
  }
}

const open = (hub: SseHub, onClose = () => {}) => {
  const res = new StalledResponse();
  const stream = hub.open(res as unknown as http.ServerResponse, onClose);
  return { res, stream, send: (frame: string) => stream.send(frame) };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SseHub', () => {
  it('starts an event stream and pings it', () => {
    const { res } = open(new SseHub({ pingMs: 100, maxBufferedBytes: 1000 }));
    expect(res.headers?.['content-type']).toMatch(/^text\/event-stream/);
    vi.advanceTimersByTime(250);
    expect(res.written).toEqual([': ping\n\n', ': ping\n\n']);
  });

  it('closes a stream whose client stops reading once the buffer limit is passed', async () => {
    const onClose = vi.fn();
    const { res, send } = open(new SseHub({ pingMs: 100_000, maxBufferedBytes: 10 }), onClose);
    send('12345');
    send('67890');
    expect(res.destroyed).toBe(false);
    send('x');
    expect(res.destroyed).toBe(true);
    send('dropped');
    expect(res.written).toEqual(['12345', '67890', 'x']);
    await Promise.resolve();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('ends every open stream on close() and stops pinging them', async () => {
    const hub = new SseHub({ pingMs: 100, maxBufferedBytes: 1000 });
    const a = open(hub);
    const b = open(hub);
    hub.close();
    expect([a.res.writableEnded, b.res.writableEnded]).toEqual([true, true]);
    await Promise.resolve();
    vi.advanceTimersByTime(500);
    expect([...a.res.written, ...b.res.written]).toEqual([]);
  });

  describe('pace', () => {
    const settled = async (promise: Promise<void> | undefined) => {
      let done = false;
      void promise?.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(0);
      return done;
    };

    it('goes on at once while the client reads, and lets other work run now and then', async () => {
      const { stream } = open(new SseHub({ pingMs: 100_000, maxBufferedBytes: 1000 }));
      const paces = Array.from({ length: YIELD_EVERY }, () => stream.pace());
      expect(paces.slice(0, -1).every((pace) => pace === undefined)).toBe(true);
      expect(await settled(paces.at(-1))).toBe(true);
    });

    it('waits until the client has read what was written', async () => {
      const { res, stream } = open(new SseHub({ pingMs: 100_000, maxBufferedBytes: 1000 }));
      res.writableNeedDrain = true;
      const pace = stream.pace();
      expect(await settled(pace)).toBe(false);
      res.writableNeedDrain = false;
      res.emit('drain');
      expect(await settled(pace)).toBe(true);
    });

    it('stops waiting when the stream closes, after onClose ran', async () => {
      const onClose = vi.fn();
      const { res, stream } = open(
        new SseHub({ pingMs: 100_000, maxBufferedBytes: 1000 }),
        onClose,
      );
      res.writableNeedDrain = true;
      const pace = stream.pace();
      res.destroy();
      expect(stream.open).toBe(false);
      await pace;
      expect(onClose).toHaveBeenCalledOnce();
      // Ended: every later pace waits for the close as well, instead of going on.
      expect(stream.pace()).toBeInstanceOf(Promise);
    });
  });
});
