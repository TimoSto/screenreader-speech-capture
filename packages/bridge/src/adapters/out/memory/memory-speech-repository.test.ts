import { describe, expect, it } from 'vitest';
import type { NewSpeechEntry } from '../../../domain/speech-entry.js';
import { MemorySpeechRepository } from './memory-speech-repository.js';

const draft = (text: string): NewSpeechEntry => ({
  kind: 'speech',
  text,
  receivedAt: new Date(0),
  source: 'tcp',
  voice: null,
  connectionId: 1,
  sessionId: null,
});

const inSession = (text: string, sessionId: number | null): NewSpeechEntry => ({
  ...draft(text),
  sessionId,
});

function fill(repo: MemorySpeechRepository, count: number) {
  for (let i = 1; i <= count; i++) repo.add(draft(`t${i}`));
}

const texts = (repo: MemorySpeechRepository, since: number, limit = 100) =>
  repo.list(since, limit).entries.map((e) => e.text);

describe('MemorySpeechRepository', () => {
  it('assigns increasing seq and lists entries after since', () => {
    const repo = new MemorySpeechRepository(10);
    fill(repo, 3);
    expect(repo.list(0, 100).entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(texts(repo, 1)).toEqual(['t2', 't3']);
    expect(texts(repo, 0, 2)).toEqual(['t1', 't2']);
    expect(texts(repo, 3)).toEqual([]);
  });

  it('reports hasMore while entries after the page remain', () => {
    const repo = new MemorySpeechRepository(10);
    fill(repo, 3);
    expect(repo.list(0, 2).hasMore).toBe(true);
    expect(repo.list(2, 2).hasMore).toBe(false);
    expect(repo.list(0, 3).hasMore).toBe(false);
    expect(repo.list(3, 2).hasMore).toBe(false);
  });

  it('drops the oldest entries when full and reports truncated', () => {
    const repo = new MemorySpeechRepository(3);
    fill(repo, 5);
    expect(texts(repo, 0)).toEqual(['t3', 't4', 't5']);
    expect(repo.list(0, 100).truncated).toBe(true);
    expect(repo.list(1, 100).truncated).toBe(true);
    expect(repo.list(2, 100).truncated).toBe(false);
    expect(repo.stats()).toEqual({ size: 3, maxEntries: 3, firstSeq: 3, lastSeq: 5 });
  });

  it('stays correct over many overflows', () => {
    const repo = new MemorySpeechRepository(4);
    fill(repo, 1000);
    expect(texts(repo, 0)).toEqual(['t997', 't998', 't999', 't1000']);
    expect(texts(repo, 998)).toEqual(['t999', 't1000']);
  });

  it('drops the oldest entries at once when maxEntries shrinks, and keeps more when it grows', () => {
    const repo = new MemorySpeechRepository(5);
    fill(repo, 5);
    repo.setMaxEntries(2);
    expect(repo.stats()).toEqual({ size: 2, maxEntries: 2, firstSeq: 4, lastSeq: 5 });
    expect(repo.list(0).truncated).toBe(true);
    repo.setMaxEntries(4);
    fill(repo, 2);
    expect(repo.stats()).toMatchObject({ size: 4, firstSeq: 4, lastSeq: 7 });
  });

  it('keeps counting seq after clear, and clear is not truncation', () => {
    const repo = new MemorySpeechRepository(2);
    fill(repo, 3);
    repo.clear();
    expect(repo.stats()).toEqual({ size: 0, maxEntries: 2, firstSeq: null, lastSeq: null });
    const next = repo.add(draft('after'));
    expect(next.seq).toBe(4);
    expect(repo.list(0, 100)).toEqual({ entries: [next], truncated: false, hasMore: false });
  });

  describe('sessions', () => {
    it('tracks first, last and count of each session and lists one session', () => {
      const repo = new MemorySpeechRepository(10);
      repo.add(inSession('before', null));
      repo.add(inSession('a1', 1));
      repo.add(inSession('a2', 1));
      repo.add(inSession('between', null));
      repo.add(inSession('b1', 2));
      expect(repo.sessionStats(1)).toEqual({
        firstSeq: 2,
        lastSeq: 3,
        entries: 2,
        droppedUpToSeq: 0,
      });
      expect(repo.sessionStats(2)).toMatchObject({ firstSeq: 5, lastSeq: 5, entries: 1 });
      expect(repo.sessionStats(9)).toEqual({
        firstSeq: null,
        lastSeq: null,
        entries: 0,
        droppedUpToSeq: 0,
      });
      expect(repo.list(0, 100, 1).entries.map((e) => e.text)).toEqual(['a1', 'a2']);
      expect(repo.list(2, 100, 1).entries.map((e) => e.text)).toEqual(['a2']);
      expect(repo.list(0, 1, 1).hasMore).toBe(true);
    });

    it('follows the dropped entries, and reports truncated only for the session that lost some', () => {
      const repo = new MemorySpeechRepository(3);
      repo.add(inSession('a1', 1));
      repo.add(inSession('a2', 1));
      repo.add(inSession('b1', 2));
      repo.add(inSession('b2', 2));
      expect(repo.sessionStats(1)).toEqual({
        firstSeq: 2,
        lastSeq: 2,
        entries: 1,
        droppedUpToSeq: 1,
      });
      expect(repo.list(0, 100, 1)).toMatchObject({ truncated: true });
      expect(repo.list(1, 100, 1)).toMatchObject({ truncated: false });
      expect(repo.list(0, 100, 2)).toMatchObject({ truncated: false });

      repo.add(inSession('b3', 2));
      expect(repo.sessionStats(1)).toEqual({
        firstSeq: null,
        lastSeq: null,
        entries: 0,
        droppedUpToSeq: 2,
      });
      expect(repo.list(0, 100, 1)).toEqual({ entries: [], truncated: true, hasMore: false });
    });

    it('lists the entries outside sessions with null, truncated only when one of them was dropped', () => {
      const repo = new MemorySpeechRepository(3);
      repo.add(inSession('a1', 1));
      repo.add(inSession('o1', null));
      repo.add(inSession('b1', 2));
      repo.add(inSession('o2', null));
      // a1 was dropped: not an outside entry.
      expect(repo.list(0, 100, null)).toEqual({
        entries: [expect.objectContaining({ text: 'o1' }), expect.objectContaining({ text: 'o2' })],
        truncated: false,
        hasMore: false,
      });

      repo.add(inSession('b2', 2));
      expect(repo.list(0, 100, null)).toMatchObject({ truncated: true });
      expect(repo.list(2, 100, null)).toMatchObject({ truncated: false });

      repo.clear();
      expect(repo.list(0, 100, null)).toEqual({ entries: [], truncated: false, hasMore: false });
    });

    it('resets the session stats on clear and when a session is forgotten', () => {
      const repo = new MemorySpeechRepository(10);
      repo.add(inSession('a1', 1));
      repo.add(inSession('b1', 2));
      repo.forgetSession(1);
      expect(repo.sessionStats(1).entries).toBe(0);
      repo.clear();
      expect(repo.sessionStats(2).entries).toBe(0);
      repo.add(inSession('b2', 2));
      expect(repo.sessionStats(2)).toMatchObject({ firstSeq: 3, lastSeq: 3, entries: 1 });
    });
  });
});
