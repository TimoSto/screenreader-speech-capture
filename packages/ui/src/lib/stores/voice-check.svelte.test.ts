import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechEntryDto, StatusDto } from '@screenreader-speech-capture/shared';
import {
  CHECK_MARKER,
  KEYS_TIMEOUT_MS,
  LISTEN_TIMEOUT_MS,
  MAX_HEARD,
  QUIET_MS,
  type SpeechProbeHandlers,
} from '#lib/core/setup.js';
import { statusWith } from '../../test/status.js';
import { createVoiceCheckStore } from './voice-check.svelte.js';

const entry = (seq: number, patch: Partial<SpeechEntryDto> = {}): SpeechEntryDto => ({
  seq,
  kind: 'speech',
  text: `text ${seq}`,
  receivedAt: '2026-11-12T09:00:00.000Z',
  source: 'tcp',
  voice: null,
  connectionId: null,
  sessionId: null,
  ...patch,
});
const marker = (seq: number, text = CHECK_MARKER) => entry(seq, { kind: 'marker', text });

function setup(lastSeq: number | null = 41) {
  const status: StatusDto = statusWith({
    buffer: { size: 1, maxEntries: 10, firstSeq: lastSeq, lastSeq },
  });
  const opened: { since: number; handlers: SpeechProbeHandlers; close: () => void }[] = [];
  const calls: string[] = [];
  const statusApi = { fetch: vi.fn(() => Promise.resolve(status)) };
  const keys = {
    press: vi.fn((chord: string) => {
      calls.push(`press ${chord}`);
      return Promise.resolve();
    }),
  };
  const speech = {
    addMarker: vi.fn((label: string) => {
      calls.push(`marker ${label}`);
      return Promise.resolve();
    }),
  };
  const store = createVoiceCheckStore(
    statusApi,
    {
      listen(since, handlers) {
        const close = vi.fn();
        calls.push('listen');
        opened.push({ since, handlers, close });
        return close;
      },
    },
    keys,
    speech,
  );
  return { store, statusApi, keys, speech, opened, calls };
}

describe('voice check store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('listens from the newest entry on, without a marker or keys', async () => {
    const { store, opened, calls } = setup();
    await store.start('manual');
    expect(opened[0].since).toBe(41);
    expect(store.phase).toBe('listening');
    expect(calls).toEqual(['listen']);
  });

  it('listens from the start with an empty buffer', async () => {
    const { store, opened } = setup(null);
    await store.start('manual');
    expect(opened[0].since).toBe(0);
  });

  it('collects the speech until it pauses, then closes the stream', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    opened[0].handlers.onEntry(entry(42));
    expect(store.phase).toBe('heard');
    await vi.advanceTimersByTimeAsync(QUIET_MS - 1);
    opened[0].handlers.onEntry(entry(43));
    await vi.advanceTimersByTimeAsync(QUIET_MS);
    expect(opened[0].close).toHaveBeenCalledOnce();
    opened[0].handlers.onEntry(entry(44));
    expect(store.entries.map(({ seq }) => seq)).toEqual([42, 43]);
    await vi.advanceTimersByTimeAsync(LISTEN_TIMEOUT_MS);
    expect(store.phase).toBe('heard');
  });

  it('stops at the most it shows', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    for (let seq = 42; seq < 42 + MAX_HEARD + 2; seq++) opened[0].handlers.onEntry(entry(seq));
    expect(store.entries).toHaveLength(MAX_HEARD);
    expect(opened[0].close).toHaveBeenCalledOnce();
  });

  it('is silent when nothing arrives in time', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    opened[0].handlers.onEntry(marker(42));
    await vi.advanceTimersByTimeAsync(LISTEN_TIMEOUT_MS);
    expect(store.phase).toBe('silent');
    expect(opened[0].close).toHaveBeenCalledOnce();
  });

  it('listens, marks and then presses the keys', async () => {
    const { store, calls } = setup();
    await store.start('keys');
    expect(calls).toEqual(['listen', `marker ${CHECK_MARKER}`, 'press Insert+T']);
    expect(store.via).toBe('keys');
  });

  it('counts only the speech after its marker', async () => {
    const { store, opened } = setup();
    await store.start('keys');
    opened[0].handlers.onEntry(entry(42));
    opened[0].handlers.onEntry(marker(43, 'step 1'));
    opened[0].handlers.onEntry(entry(44));
    expect(store.phase).toBe('listening');
    opened[0].handlers.onEntry(marker(45));
    opened[0].handlers.onEntry(entry(46));
    expect(store.entries.map(({ seq }) => seq)).toEqual([46]);
  });

  it('is silent when the keys bring no speech', async () => {
    const { store } = setup();
    await store.start('keys');
    await vi.advanceTimersByTimeAsync(KEYS_TIMEOUT_MS);
    expect(store.phase).toBe('silent');
  });

  it('keeps speech that arrived before the keys call answered', async () => {
    const { store, keys, opened } = setup();
    keys.press.mockImplementation(() => {
      opened[0].handlers.onEntry(marker(42));
      opened[0].handlers.onEntry(entry(43));
      return Promise.reject(new Error('The bridge is not reachable'));
    });
    await store.start('keys');
    expect(store.phase).toBe('heard');
  });

  it('fails with the reason when the keys are refused', async () => {
    const { store, keys, opened } = setup();
    keys.press.mockRejectedValue(new Error('only on Windows'));
    await store.start('keys');
    expect(store.phase).toBe('failed');
    expect(store.failure).toBe('only on Windows');
    expect(opened[0].close).toHaveBeenCalledOnce();
  });

  it('sends no keys when the marker is refused', async () => {
    const { store, keys, speech } = setup();
    speech.addMarker.mockRejectedValue(new Error('refused'));
    await store.start('keys');
    expect(store.phase).toBe('failed');
    expect(keys.press).not.toHaveBeenCalled();
  });

  it('sends no keys when it was stopped in between', async () => {
    const { store, keys, speech } = setup();
    speech.addMarker.mockImplementation(() => {
      store.stop();
      return Promise.resolve();
    });
    await store.start('keys');
    expect(keys.press).not.toHaveBeenCalled();
    expect(store.phase).toBe('idle');
  });

  it('fails when the status cannot be read', async () => {
    const { store, statusApi, opened } = setup();
    statusApi.fetch.mockRejectedValue(new Error('502'));
    await store.start('manual');
    expect(store.phase).toBe('failed');
    expect(store.failure).toBe('The bridge is not reachable.');
    expect(opened).toHaveLength(0);
  });

  it('fails when the stream is gone', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    opened[0].handlers.onState('failed');
    expect(store.phase).toBe('failed');
    expect(opened[0].close).toHaveBeenCalledOnce();
  });

  it('fails instead of staying silent while the connection is lost', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    opened[0].handlers.onState('reconnecting');
    expect(store.reconnecting).toBe(true);
    await vi.advanceTimersByTimeAsync(LISTEN_TIMEOUT_MS);
    expect(store.phase).toBe('failed');
    expect(store.reconnecting).toBe(false);
  });

  it('ignores an earlier run after a new start', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    await store.start('manual');
    expect(opened[0].close).toHaveBeenCalledOnce();
    opened[0].handlers.onEntry(entry(42));
    expect(store.phase).toBe('listening');
  });

  it('opens nothing when stopped while the status is read', async () => {
    const { store, opened } = setup();
    const started = store.start('manual');
    store.stop();
    await started;
    expect(opened).toHaveLength(0);
    expect(store.phase).toBe('idle');
  });

  it('forgets the result when stopped', async () => {
    const { store, opened } = setup();
    await store.start('manual');
    opened[0].handlers.onEntry(entry(42));
    store.stop();
    expect(store.phase).toBe('idle');
    expect(store.entries).toEqual([]);
  });
});
