import { describe, expect, it, vi } from 'vitest';
import type { SpeechEntryDto } from '@screenreader-speech-capture/shared';
import {
  MAX_ROWS,
  type SpeechApi,
  type SpeechFeed,
  type SpeechFeedHandlers,
} from '#lib/core/speech.js';
import type { SessionScope } from '#lib/core/sessions.js';
import { createSpeechStore } from './speech.svelte.js';

const entry = (seq: number, kind: 'speech' | 'marker' = 'speech'): SpeechEntryDto => ({
  seq,
  kind,
  text: `text ${seq}`,
  receivedAt: '2026-11-12T09:00:00.000Z',
  source: 'tcp',
  voice: null,
  connectionId: null,
  sessionId: null,
});

function fakes() {
  const opened: {
    scope: SessionScope;
    live: boolean;
    handlers: SpeechFeedHandlers;
    close: () => void;
  }[] = [];
  const feed: SpeechFeed = {
    open(scope, live, handlers) {
      const close = vi.fn();
      opened.push({ scope, live, handlers, close });
      return close;
    },
  };
  const labels: string[] = [];
  const api: SpeechApi = {
    addMarker(label) {
      labels.push(label);
      return label === 'bad' ? Promise.reject(new Error('refused')) : Promise.resolve();
    },
  };
  return { feed, api, opened, labels };
}

describe('createSpeechStore', () => {
  it('collects the entries of the feed', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open(2, true);
    opened[0].handlers.onEntry(entry(1));
    opened[0].handlers.onEntry(entry(2));
    expect(opened[0].scope).toBe(2);
    expect(store.entries.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('drops an entry it has already seen (a replay after a reconnect)', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open('none', true);
    opened[0].handlers.onEntry(entry(1));
    opened[0].handlers.onEntry(entry(2));
    opened[0].handlers.onEntry(entry(2));
    opened[0].handlers.onEntry(entry(1));
    expect(store.entries.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('empties the table when the bridge wipes its buffer', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open('none', true);
    opened[0].handlers.onEntry(entry(1));
    opened[0].handlers.onClear();
    expect(store.entries).toEqual([]);
    opened[0].handlers.onEntry(entry(2));
    expect(store.entries.map((e) => e.seq)).toEqual([2]);
  });

  it('stops the old feed and starts empty when the scope changes', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open(1, true);
    opened[0].handlers.onEntry(entry(1));
    store.open(2, true);
    expect(opened[0].close).toHaveBeenCalledOnce();
    expect(store.entries).toEqual([]);
    expect(opened[1].scope).toBe(2);
  });

  it('stops the feed with the function open returns', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    const stop = store.open(1, true);
    stop();
    stop();
    expect(opened[0].close).toHaveBeenCalledOnce();
  });

  it('keeps the newest rows when the cap is reached', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open(1, true);
    for (let seq = 1; seq <= MAX_ROWS + 2; seq++) opened[0].handlers.onEntry(entry(seq));
    expect(store.entries).toHaveLength(MAX_ROWS);
    expect(store.entries[0].seq).toBe(3);
  });

  it('tells the feed whether the scope is live', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open(1, false);
    expect(opened[0].live).toBe(false);
  });

  it('adds a batch in order and skips what it already shows', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open(1, false);
    opened[0].handlers.onEntries([entry(1), entry(2), entry(3)]);
    opened[0].handlers.onEntries([entry(2), entry(3), entry(4)]);
    expect(store.entries.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('follows the connection state', () => {
    const { feed, api, opened } = fakes();
    const store = createSpeechStore(feed, api);
    store.open(1, true);
    expect(store.connection).toBe('connecting');
    opened[0].handlers.onState('live');
    expect(store.connection).toBe('live');
  });

  it('adds a marker through the api and leaves the table to the feed', async () => {
    const { feed, api, labels } = fakes();
    const store = createSpeechStore(feed, api);
    await store.addMarker('step 3');
    expect(labels).toEqual(['step 3']);
    expect(store.entries).toEqual([]);
  });

  it('passes on the reason a marker was refused', async () => {
    const { feed, api } = fakes();
    const store = createSpeechStore(feed, api);
    await expect(store.addMarker('bad')).rejects.toThrow('refused');
  });
});
