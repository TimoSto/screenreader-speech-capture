import { describe, expect, it, vi } from 'vitest';
import { createAsyncConsole, type ConsoleChannel } from './async-console.js';

/** A console that takes nothing until `release()`: like a window with selected text. */
function fakeChannel() {
  const posted: string[] = [];
  let onMessage: Parameters<ConsoleChannel['onMessage']>[0] = () => {};
  let onFailure = () => {};
  const flushes: number[] = [];
  const channel: ConsoleChannel = {
    post: (text) => void posted.push(text),
    requestFlush: (id) => void flushes.push(id),
    onMessage: (listener) => void (onMessage = listener),
    onFailure: (listener) => void (onFailure = listener),
  };
  return {
    channel,
    posted,
    flushes,
    written: (bytes: number) => onMessage({ written: bytes }),
    flushed: (id: number) => onMessage({ flushed: id }),
    fail: () => onFailure(),
  };
}

describe('createAsyncConsole', () => {
  it('posts text without waiting for the console', () => {
    const f = fakeChannel();
    const out = createAsyncConsole({ channel: f.channel, fallback: () => {} });
    out.write('a\n');
    out.write('b\n');
    expect(f.posted).toEqual(['a\n', 'b\n']);
  });

  it('drops lines while the console is stuck and says so afterwards', () => {
    const f = fakeChannel();
    const out = createAsyncConsole({ channel: f.channel, fallback: () => {}, maxPendingBytes: 4 });
    out.write('abc\n'); // 4 bytes pending: full
    out.write('dropped 1\n');
    out.write('dropped 2\n');
    expect(f.posted).toEqual(['abc\n']);

    f.written(4);
    out.write('back\n');
    expect(f.posted[1]).toContain('2 lines dropped');
    expect(f.posted[2]).toBe('back\n');
  });

  it('flushes when the console answers, or after the timeout when it is stuck', async () => {
    vi.useFakeTimers();
    try {
      const f = fakeChannel();
      const out = createAsyncConsole({ channel: f.channel, fallback: () => {} });
      const done = out.flush(1000);
      f.flushed(f.flushes[0] as number);
      await done;

      const stuck = out.flush(1000);
      await vi.advanceTimersByTimeAsync(1000);
      await stuck;
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to direct writes when the worker dies', async () => {
    const f = fakeChannel();
    const fallback = vi.fn();
    const out = createAsyncConsole({ channel: f.channel, fallback });
    f.fail();
    out.write('x\n');
    expect(fallback).toHaveBeenCalledWith('x\n');
    await out.flush();
  });
});
