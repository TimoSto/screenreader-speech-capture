/* eslint-disable @typescript-eslint/unbound-method -- `vi.fn` spies on the fake API are asserted on directly */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionDto, SessionListDto } from '@screenreader-speech-capture/shared';
import type { SessionsApi } from '#lib/core/sessions.js';
import { createSessionsStore } from './sessions.svelte.js';

const session = (id: number, endedAt: string | null = null): SessionDto => ({
  id,
  name: `session ${id}`,
  run: null,
  client: null,
  startedAt: '2026-11-12T09:00:00.000Z',
  endedAt,
  startSeq: 0,
  firstSeq: null,
  lastSeq: null,
  entries: 0,
});

function fakeApi(initial: Omit<SessionListDto, 'outsideEntries'> & { outsideEntries?: number }) {
  let state: SessionListDto = { outsideEntries: 0, ...initial };
  const api: SessionsApi = {
    list: vi.fn(() => Promise.resolve(state)),
    start: vi.fn((name: string) => {
      const started = session(state.sessions.length + 1);
      state = { ...state, sessions: [started, ...state.sessions], currentId: started.id };
      return Promise.resolve({ ...started, name, replaced: null });
    }),
    end: vi.fn(() => {
      state = { ...state, currentId: null };
      return Promise.resolve();
    }),
    delete: vi.fn((id: number) => {
      state = { ...state, sessions: state.sessions.filter((s) => s.id !== id) };
      return Promise.resolve();
    }),
  };
  return api;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('createSessionsStore', () => {
  it('keeps the number of entries outside any session', async () => {
    const api = fakeApi({ sessions: [], currentId: null, outsideEntries: 5 });
    const store = createSessionsStore(api);
    const stop = store.init(null);
    await vi.waitFor(() => expect(store.outsideEntries).toBe(5));
    stop();
  });

  it('shows the seed at once and then reads the list', async () => {
    const api = fakeApi({ sessions: [session(2), session(1)], currentId: 2 });
    const store = createSessionsStore(api);
    const stop = store.init({ sessions: [session(1)], currentId: 1, outsideEntries: 0 });
    expect(store.currentId).toBe(1);
    await vi.waitFor(() => expect(store.currentId).toBe(2));
    expect(store.sessions.map((s) => s.id)).toEqual([2, 1]);
    stop();
  });

  it('is loaded once a list is applied, and not after a failed first read', async () => {
    const api = fakeApi({ sessions: [session(1)], currentId: 1 });
    const store = createSessionsStore(api);
    expect(store.loaded).toBe(false);
    const stop = store.init(null);
    await vi.waitFor(() => expect(store.loaded).toBe(true));
    stop();

    const down = fakeApi({ sessions: [], currentId: null });
    vi.mocked(down.list).mockRejectedValue(new Error('down'));
    const failed = createSessionsStore(down);
    const stopFailed = failed.init(null);
    await vi.waitFor(() => expect(failed.reachable).toBe(false));
    expect(failed.loaded).toBe(false);
    stopFailed();
  });

  it('keeps the last list when the bridge cannot be reached', async () => {
    const api = fakeApi({ sessions: [session(1)], currentId: 1 });
    vi.mocked(api.list).mockRejectedValue(new Error('down'));
    const store = createSessionsStore(api);
    const stop = store.init({ sessions: [session(1)], currentId: 1, outsideEntries: 0 });
    await vi.waitFor(() => expect(store.reachable).toBe(false));
    expect(store.sessions).toHaveLength(1);
    stop();
  });

  it('reads again after a start and after an end', async () => {
    const api = fakeApi({ sessions: [], currentId: null });
    const store = createSessionsStore(api);
    const stop = store.init(null);
    await store.start('checkout test', null);
    expect(api.start).toHaveBeenCalledWith('checkout test', null);
    expect(store.currentId).toBe(1);
    await store.end();
    expect(store.currentId).toBeNull();
    stop();
  });

  it('reads again after a delete', async () => {
    const api = fakeApi({ sessions: [session(1, '2026-11-12T09:00:00.000Z')], currentId: null });
    const store = createSessionsStore(api);
    const stop = store.init(null);
    await vi.waitFor(() => expect(store.sessions).toHaveLength(1));
    await store.delete(1);
    expect(api.delete).toHaveBeenCalledWith(1);
    expect(store.sessions).toEqual([]);
    stop();
  });

  it('lets a failed start reject with the bridge message and changes nothing', async () => {
    const api = fakeApi({ sessions: [], currentId: null });
    vi.mocked(api.start).mockRejectedValue(new Error('name too long'));
    const store = createSessionsStore(api);
    await expect(store.start('x', null)).rejects.toThrow('name too long');
    expect(store.sessions).toEqual([]);
  });

  it('ticks now only while a session is live and stops on dispose', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    const api = fakeApi({ sessions: [session(1)], currentId: 1 });
    const store = createSessionsStore(api);
    const stop = store.init({ sessions: [session(1)], currentId: 1, outsideEntries: 0 });
    const before = store.now;
    vi.advanceTimersByTime(1000);
    expect(store.now).toBeGreaterThan(before);
    stop();
    const stopped = store.now;
    vi.advanceTimersByTime(5000);
    expect(store.now).toBe(stopped);
  });
});
